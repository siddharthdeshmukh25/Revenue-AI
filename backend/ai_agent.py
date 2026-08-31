"""
ai_agent.py
-----------
All LLM logic lives here: the prompt, the Groq API call, and
strict parsing of the model's response into a structured decision.

The agent is deliberately constrained:
  - It must return ONE of a fixed set of actions (no free-form behavior).
  - It never sends anything itself — it only *proposes* a diagnosis,
    an action, and a message. main.py enforces the stopping rules and
    decides whether the proposal is actually executed.
"""

import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# The fixed action vocabulary the LLM is allowed to choose from.
# Keeping this closed (instead of free text) is what makes the agent "bounded".
ALLOWED_ACTIONS = [
    "SEND_EMI_LINK",        # insufficient funds -> offer to split into EMIs
    "SEND_RETRY_LINK",      # transient gateway/network error -> simple retry
    "SEND_ALT_PAYMENT_LINK",  # card declined/expired -> offer UPI/other method
    "SEND_SUPPORT_MESSAGE",  # unclear/other cause -> human-friendly nudge, no hard sell
    "NO_ACTION",            # AI judges no recovery message is warranted
]

SYSTEM_PROMPT = f"""You are a Revenue Recovery Agent for a payments company (Razorpay-style).
You diagnose why a payment failed or a checkout was abandoned, and propose ONE
bounded recovery action. You are cautious, not pushy, and never invent facts
about the user.

You MUST respond with STRICT JSON only, no markdown, no commentary, matching
this exact schema:

{{
  "root_cause": "<short human-readable diagnosis, e.g. 'Insufficient Funds'>",
  "action_taken": "<one of: {', '.join(ALLOWED_ACTIONS)}>",
  "message_sent": "<a short, friendly, personalized recovery message to the customer, or empty string if action_taken is NO_ACTION>",
  "confidence": <float between 0 and 1>
}}

Rules for choosing action_taken:
- INSUFFICIENT_FUNDS error_code -> SEND_EMI_LINK
- GATEWAY_TIMEOUT / NETWORK_ERROR / GATEWAY_ERROR -> SEND_RETRY_LINK
- CARD_DECLINED / CARD_EXPIRED -> SEND_ALT_PAYMENT_LINK
- Abandoned checkout with no clear error -> SEND_SUPPORT_MESSAGE
- If the situation is ambiguous or you are unsure a message would help -> NO_ACTION

The message must be under 300 characters, polite, and must NOT pressure,
guilt, or spam the customer. Never fabricate discounts, refunds, or
guarantees you were not told about.
"""


def _build_user_prompt(txn: dict, error_code: str | None) -> str:
    return (
        "Diagnose this transaction and propose ONE recovery action as JSON.\n\n"
        f"Transaction status: {txn.get('status')}\n"
        f"Error code: {error_code or 'UNKNOWN'}\n"
        f"Amount: {txn.get('amount')}\n"
        f"txn_id: {txn.get('txn_id')}\n"
    )


def diagnose_and_recommend(txn: dict, error_code: str | None) -> dict:
    """
    Calls Groq with the transaction context and returns a parsed dict:
        {root_cause, action_taken, message_sent, confidence}

    Falls back to a safe NO_ACTION decision if the API call fails or the
    model returns something unparsable — the agent should never crash the
    webhook flow or take an unbounded action on a bad response.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY missing. Set it in your .env file.")

    try:
        client = Groq(api_key=GROQ_API_KEY)
        
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(txn, error_code)},
            ],
            temperature=0.3,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        raw_content = response.choices[0].message.content
        parsed = json.loads(raw_content)

        return _validate_decision(parsed)

    except Exception as e:
        # Never let a malformed LLM response or network hiccup take down
        # the webhook, or worse, trigger an unbounded action.
        return {
            "root_cause": "UNKNOWN (AI error)",
            "action_taken": "NO_ACTION",
            "message_sent": "",
            "confidence": 0.0,
            "error": str(e),
        }


def _validate_decision(parsed: dict) -> dict:
    """Guard-rail: force the model's output back into the allowed action set."""
    action = parsed.get("action_taken", "NO_ACTION")
    if action not in ALLOWED_ACTIONS:
        action = "NO_ACTION"

    message = parsed.get("message_sent", "") or ""
    if action == "NO_ACTION":
        message = ""
    message = message[:300]  # hard length cap, matches the prompt's instruction

    return {
        "root_cause": parsed.get("root_cause", "Unknown"),
        "action_taken": action,
        "message_sent": message,
        "confidence": float(parsed.get("confidence", 0.5)),
    }
