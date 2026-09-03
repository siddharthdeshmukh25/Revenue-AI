"""
database.py
-----------
Thin data-access layer around Supabase.

Every function here does ONE job (create user, log audit entry, count
attempts, etc.) so that main.py and ai_agent.py never talk to the database
directly. This keeps the "stopping rules" logic auditable in one place.
"""

import os
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
MAX_INTERVENTION_ATTEMPTS = int(os.getenv("MAX_INTERVENTION_ATTEMPTS", 2))

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL or SUPABASE_KEY not found.")
    print("Please set these environment variables in your .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------
# USERS
# ---------------------------------------------------------------------
def get_or_create_user(name: str, email: str, phone: Optional[str] = None) -> dict:
    """Fetch a user by email, or create one if they don't exist yet."""
    result = supabase.table('users').select('*').eq('email', email).execute()
    if result.data:
        return result.data[0]
    
    result = supabase.table('users').insert({
        'name': name,
        'email': email,
        'phone': phone
    }).execute()
    return result.data[0]


# ---------------------------------------------------------------------
# TRANSACTIONS
# ---------------------------------------------------------------------
def create_transaction(user_id: str, amount: float, status: str, error_code: Optional[str]) -> dict:
    """Insert a new at-risk transaction (failed payment / abandoned checkout)."""
    result = supabase.table('transactions').insert({
        'user_id': user_id,
        'amount': amount,
        'status': status,
        'error_code': error_code
    }).execute()
    return result.data[0]


def update_transaction_status(txn_id: str, status: str) -> None:
    supabase.table('transactions').update({'status': status}).eq('txn_id', txn_id).execute()


def get_transaction(txn_id: str) -> Optional[dict]:
    result = supabase.table('transactions').select('*').eq('txn_id', txn_id).execute()
    return result.data[0] if result.data else None


# ---------------------------------------------------------------------
# AI AUDIT LOGS  (this table IS the audit trail + the stopping-rule state)
# ---------------------------------------------------------------------
def get_logs_for_user(user_id: str) -> list:
    """
    Pull every audit log tied to transactions belonging to this user.
    Used to enforce the "max attempts per user" stopping rule, and to
    check for an existing 'promise_to_pay' from a previous intervention.
    """
    result = supabase.table('transactions').select('txn_id').eq('user_id', user_id).execute()
    txn_ids = [t['txn_id'] for t in result.data] if result.data else []
    if not txn_ids:
        return []
    
    result = supabase.table('ai_audit_logs').select('*').in_('txn_id', txn_ids).execute()
    return result.data if result.data else []


def count_intervention_attempts(user_id: str) -> int:
    """Number of recovery actions already sent to this user (across all their txns)."""
    logs = get_logs_for_user(user_id)
    return len([l for l in logs if l["action_taken"] not in ("HALT_MAX_ATTEMPTS", "HALT_PROMISE_TO_PAY")])


def has_active_promise_to_pay(user_id: str) -> bool:
    """True if any of the user's logs currently sit in 'promised_to_pay' state."""
    logs = get_logs_for_user(user_id)
    return any(l["status"] == "promised_to_pay" for l in logs)


def log_audit_entry(
    txn_id: str,
    root_cause: Optional[str],
    action_taken: str,
    message_sent: Optional[str],
    money_recovered: bool = False,
    status: str = "promise_pending",
) -> dict:
    """Write one row to ai_audit_logs. This is the single source of truth
    for 'what did the agent decide and do'."""
    result = supabase.table('ai_audit_logs').insert({
        'txn_id': txn_id,
        'root_cause_diagnosed': root_cause,
        'action_taken': action_taken,
        'message_sent': message_sent,
        'money_recovered': money_recovered,
        'status': status
    }).execute()
    return result.data[0]


# ---------------------------------------------------------------------
# DASHBOARD QUERIES
# ---------------------------------------------------------------------
def get_all_audit_logs() -> list:
    """Full audit trail, most recent first — used by the Streamlit dashboard."""
    result = supabase.table('ai_audit_logs').select('*').order('timestamp', desc=True).execute()
    return result.data if result.data else []


def get_total_money_recovered() -> float:
    """Sum of transaction amounts where money_recovered=True in the audit log."""
    result = supabase.table('ai_audit_logs').select('txn_id').eq('money_recovered', True).execute()
    if not result.data:
        return 0.0
    
    total = 0.0
    for log in result.data:
        txn = get_transaction(log['txn_id'])
        if txn:
            total += float(txn['amount'])
    return total


def get_all_transactions() -> list:
    result = supabase.table('transactions').select('*').order('created_at', desc=True).execute()
    return result.data if result.data else []


def delete_all_performance_data() -> dict:
    """Delete all audit logs, transactions, and users to clear performance data."""
    try:
        # Delete audit logs first (they reference transactions)
        supabase.table('ai_audit_logs').delete().neq('log_id', None).execute()
        # Delete transactions (they reference users)
        supabase.table('transactions').delete().neq('txn_id', None).execute()
        # Delete users
        supabase.table('users').delete().neq('user_id', None).execute()
        return {"status": "success", "message": "All performance data deleted"}
    except Exception as e:
        return {"status": "error", "message": f"Failed to delete data: {str(e)}"}
