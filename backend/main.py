"""
main.py
-------
FastAPI backend for the AI Revenue Recovery Agent.

Flow for POST /webhook/transaction:
  1. Receive simulated payment-gateway webhook (failed/abandoned txn).
  2. Persist the user + transaction.
  3. STOPPING RULES (checked BEFORE calling the AI action, and enforced
     again before logging it as executed):
       a. If user already has an active "promise_to_pay" -> HALT.
       b. If user has already hit MAX_INTERVENTION_ATTEMPTS -> HALT.
  4. If not halted: ask ai_agent.py to diagnose + propose a recovery action.
  5. Log everything (diagnosis, action, message, halted-or-not) to
     ai_audit_logs — this is the audit trail the dashboard reads.
"""

import os
import random
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import database as db
import ai_agent

load_dotenv()

app = FastAPI(
    title="AI Revenue Recovery Agent",
    description="Detects at-risk revenue, diagnoses root cause via LLM, "
                "and executes a bounded, auditable recovery workflow.",
    version="1.0.0",
)

# Allow the Streamlit dashboard (different port/process) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_INTERVENTION_ATTEMPTS = int(os.getenv("MAX_INTERVENTION_ATTEMPTS", 2))


# ---------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------
class WebhookPayload(BaseModel):
    """Simulated payment gateway webhook payload."""
    user_name: str = Field(..., example="Aarav Sharma")
    user_email: str = Field(..., example="aarav.sharma@example.com")
    user_phone: Optional[str] = Field(None, example="+919810012345")
    amount: float = Field(..., gt=0, example=2499.00)
    status: str = Field(..., example="failed")  # failed | abandoned
    error_code: Optional[str] = Field(None, example="INSUFFICIENT_FUNDS")


class WebhookResponse(BaseModel):
    txn_id: str
    halted: bool
    halt_reason: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: str
    message_sent: Optional[str] = None


class MarkRecoveredPayload(BaseModel):
    log_id: str


# ---------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "service": "ai-revenue-recovery-agent"}


# ---------------------------------------------------------------------
# Core webhook endpoint
# ---------------------------------------------------------------------
@app.post("/webhook/transaction", response_model=WebhookResponse)
def receive_transaction_webhook(payload: WebhookPayload):
    # 1. Ensure user exists
    user = db.get_or_create_user(payload.user_name, payload.user_email, payload.user_phone)
    user_id = user["user_id"]

    # 2. Record the at-risk transaction
    txn = db.create_transaction(
        user_id=user_id,
        amount=payload.amount,
        status=payload.status,
        error_code=payload.error_code,
    )
    txn_id = txn["txn_id"]

    # 3. STOPPING RULES — evaluated BEFORE any AI/action work happens
    if db.has_active_promise_to_pay(user_id):
        log = db.log_audit_entry(
            txn_id=txn_id,
            root_cause="Not evaluated (halted)",
            action_taken="HALT_PROMISE_TO_PAY",
            message_sent=None,
            money_recovered=False,
            status="halted",
        )
        return WebhookResponse(
            txn_id=txn_id,
            halted=True,
            halt_reason="User already has an active promise-to-pay. No further contact to avoid spam.",
            action_taken="HALT_PROMISE_TO_PAY",
        )

    attempts_so_far = db.count_intervention_attempts(user_id)
    if attempts_so_far >= MAX_INTERVENTION_ATTEMPTS:
        db.log_audit_entry(
            txn_id=txn_id,
            root_cause="Not evaluated (halted)",
            action_taken="HALT_MAX_ATTEMPTS",
            message_sent=None,
            money_recovered=False,
            status="halted",
        )
        return WebhookResponse(
            txn_id=txn_id,
            halted=True,
            halt_reason=f"User has reached the max of {MAX_INTERVENTION_ATTEMPTS} intervention "
                        f"attempts. Halting to prevent spam.",
            action_taken="HALT_MAX_ATTEMPTS",
        )

    # 4. Not halted -> ask the AI agent to diagnose + propose a recovery action
    decision = ai_agent.diagnose_and_recommend(txn, payload.error_code)

    # 5. Log the AI's decision as the executed action (this PoC "executes"
    #    an action by generating + logging the message; wiring it to a
    #    real SMS/email/WhatsApp sender is a drop-in swap in this block).
    status = "promised_to_pay" if decision["action_taken"] != "NO_ACTION" else "promise_pending"
    db.log_audit_entry(
        txn_id=txn_id,
        root_cause=decision["root_cause"],
        action_taken=decision["action_taken"],
        message_sent=decision["message_sent"],
        money_recovered=False,
        status=status,
    )

    return WebhookResponse(
        txn_id=txn_id,
        halted=False,
        root_cause=decision["root_cause"],
        action_taken=decision["action_taken"],
        message_sent=decision["message_sent"],
    )


# ---------------------------------------------------------------------
# Demo/utility endpoint: mark a logged intervention as having recovered
# money (simulates the customer completing payment after the nudge).
# ---------------------------------------------------------------------
@app.post("/audit-log/{log_id}/mark-recovered")
def mark_recovered(log_id: str):
    result = db.supabase.table("ai_audit_logs").update(
        {"money_recovered": True, "status": "recovered"}
    ).eq("log_id", log_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return {"status": "updated", "log_id": log_id}


# ---------------------------------------------------------------------
# Dashboard data endpoints (Streamlit reads through these, or hits
# Supabase directly — both are shown in frontend/app.py)
# ---------------------------------------------------------------------
@app.get("/dashboard/summary")
def dashboard_summary():
    logs = db.get_all_audit_logs()
    total_recovered = db.get_total_money_recovered()
    return {
        "total_money_recovered": total_recovered,
        "total_interventions": len([l for l in logs if not l["action_taken"].startswith("HALT")]),
        "total_halted": len([l for l in logs if l["action_taken"].startswith("HALT")]),
        "total_logs": len(logs),
    }


@app.get("/dashboard/audit-logs")
def dashboard_audit_logs():
    return db.get_all_audit_logs()


@app.get("/audit-logs")
def audit_logs():
    """Endpoint for Next.js frontend to fetch all audit logs with total recovered"""
    logs = db.get_all_audit_logs()
    total_recovered = db.get_total_money_recovered()
    return {
        "logs": logs,
        "total_recovered": total_recovered
    }


@app.delete("/performance-data")
def delete_performance_data():
    """Delete all performance data (audit logs, transactions, users)"""
    return db.delete_all_performance_data()


@app.post("/auto-generate")
def auto_generate_transactions(count: int = 5):
    """Auto-generate random test transactions with AI processing"""
    results = []
    
    # Sample data for random generation
    names = ["Aarav Sharma", "Priya Patel", "Rahul Kumar", "Sneha Gupta", "Vikram Singh", "Anjali Verma", "Rohan Mehta", "Kavita Rao"]
    domains = ["gmail.com", "yahoo.com", "outlook.com", "example.com"]
    error_codes = ["INSUFFICIENT_FUNDS", "GATEWAY_TIMEOUT", "CARD_DECLINED", "CARD_EXPIRED", "NETWORK_ERROR"]
    amounts = [999, 1499, 2499, 4999, 9999]
    
    for i in range(count):
        # Generate random transaction data
        name = random.choice(names)
        email = f"{name.lower().replace(' ', '.')}@{random.choice(domains)}"
        phone = f"+91{random.randint(7000000000, 9999999999)}"
        amount = random.choice(amounts)
        status = random.choice(["failed", "abandoned"])
        error_code = random.choice(error_codes) if status == "failed" else None
        
        # Create webhook payload
        payload = WebhookPayload(
            user_name=name,
            user_email=email,
            user_phone=phone,
            amount=amount,
            status=status,
            error_code=error_code
        )
        
        # Process through the same webhook logic
        user = db.get_or_create_user(payload.user_name, payload.user_email, payload.user_phone)
        user_id = user["user_id"]
        
        txn = db.create_transaction(
            user_id=user_id,
            amount=payload.amount,
            status=payload.status,
            error_code=payload.error_code,
        )
        txn_id = txn["txn_id"]
        
        # Check stopping rules
        if db.has_active_promise_to_pay(user_id):
            log = db.log_audit_entry(
                txn_id=txn_id,
                root_cause="Not evaluated (halted)",
                action_taken="HALT_PROMISE_TO_PAY",
                message_sent=None,
                money_recovered=False,
                status="halted",
            )
            results.append({"txn_id": txn_id, "status": "halted", "reason": "HALT_PROMISE_TO_PAY"})
            continue
        
        attempts_so_far = db.count_intervention_attempts(user_id)
        if attempts_so_far >= MAX_INTERVENTION_ATTEMPTS:
            db.log_audit_entry(
                txn_id=txn_id,
                root_cause="Not evaluated (halted)",
                action_taken="HALT_MAX_ATTEMPTS",
                message_sent=None,
                money_recovered=False,
                status="halted",
            )
            results.append({"txn_id": txn_id, "status": "halted", "reason": "HALT_MAX_ATTEMPTS"})
            continue
        
        # AI processing
        decision = ai_agent.diagnose_and_recommend(txn, payload.error_code)
        
        status_log = "promised_to_pay" if decision["action_taken"] != "NO_ACTION" else "promise_pending"
        db.log_audit_entry(
            txn_id=txn_id,
            root_cause=decision["root_cause"],
            action_taken=decision["action_taken"],
            message_sent=decision["message_sent"],
            money_recovered=False,
            status=status_log,
        )
        
        results.append({
            "txn_id": txn_id,
            "status": "processed",
            "action_taken": decision["action_taken"],
            "root_cause": decision["root_cause"],
            "message": decision["message_sent"]
        })
    
    return {
        "total_generated": count,
        "processed": len([r for r in results if r["status"] == "processed"]),
        "halted": len([r for r in results if r["status"] == "halted"]),
        "results": results
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", 8000)),
        reload=True,
    )
