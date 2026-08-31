# AI Revenue Recovery Agent — PoC

Detects at-risk revenue (failed payments / abandoned checkouts), diagnoses the
root cause with an LLM, and executes a **bounded** recovery workflow with
strict stopping rules and a full audit trail.

## Folder structure

```
/ai-revenue-recovery
  /backend
    main.py         # FastAPI app & webhook endpoint
    ai_agent.py      # OpenRouter LLM logic and prompts
    database.py      # Supabase client + all DB access
  /frontend
    app.py           # Streamlit dashboard
  supabase_schema.sql
  requirements.txt
  .env.example
```

## 1. Setup (venv + dependencies)

```bash
cd ai-revenue-recovery
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:
- `SUPABASE_URL` / `SUPABASE_KEY` — from your Supabase project (Settings → API).
- `OPENROUTER_API_KEY` — from https://openrouter.ai/keys
- `OPENROUTER_MODEL` — e.g. `meta-llama/llama-3.1-8b-instruct` or `anthropic/claude-3.5-sonnet`

## 3. Create the database schema

In the Supabase dashboard: **SQL Editor → New query**, paste the contents of
`supabase_schema.sql`, and run it. This creates `users`, `transactions`, and
`ai_audit_logs`, plus two seed users.

## 4. Run the backend

```bash
cd backend
python main.py
# or: uvicorn main:app --reload --port 8000
```

Docs available at `http://localhost:8000/docs`.

## 5. Run the dashboard

In a second terminal (with the venv activated):

```bash
cd frontend
streamlit run app.py
```

## 6. Try it

Use the sidebar in the Streamlit app to fire a simulated webhook, or call the
API directly:

```bash
curl -X POST http://localhost:8000/webhook/transaction \
  -H "Content-Type: application/json" \
  -d '{
        "user_name": "Aarav Sharma",
        "user_email": "aarav.sharma@example.com",
        "user_phone": "+919810012345",
        "amount": 2499.00,
        "status": "failed",
        "error_code": "INSUFFICIENT_FUNDS"
      }'
```

Fire it a 3rd time for the same user to see the `HALT_MAX_ATTEMPTS` stopping
rule kick in (default limit: 2, configurable via `MAX_INTERVENTION_ATTEMPTS`
in `.env`).

## How the stopping rules work

Before the AI is even called, `backend/main.py` checks, per user:
1. **Active promise-to-pay** → halt, log `HALT_PROMISE_TO_PAY`, no message sent.
2. **Max intervention attempts reached** (default 2) → halt, log `HALT_MAX_ATTEMPTS`.

Only if neither rule trips does `ai_agent.py` get called to diagnose the
transaction and propose one action from a fixed, closed set
(`SEND_EMI_LINK`, `SEND_RETRY_LINK`, `SEND_ALT_PAYMENT_LINK`,
`SEND_SUPPORT_MESSAGE`, `NO_ACTION`). Every outcome — halted or executed —
is written to `ai_audit_logs`, which is what the dashboard renders.

## Extending beyond the PoC

- Swap the "log the message" step in `main.py` for a real SMS/WhatsApp/email
  send (Twilio, MSG91, etc.) — it's a single, clearly marked block.
- Add a cron/webhook to auto-expire `promised_to_pay` status after N days.
- Add row-level security policies in Supabase before going beyond a hackathon PoC
  (this schema uses the service-role key server-side only — never expose it
  to the Streamlit frontend in a real deployment; add a thin API layer instead).
