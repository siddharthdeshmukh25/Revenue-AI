"""
database.py
-----------
Thin data-access layer around PostgreSQL (Railway).

Every function here does ONE job (create user, log audit entry, count
attempts, etc.) so that main.py and ai_agent.py never talk to the database
directly. This keeps the "stopping rules" logic auditable in one place.
"""

import os
from typing import Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
MAX_INTERVENTION_ATTEMPTS = int(os.getenv("MAX_INTERVENTION_ATTEMPTS", 2))

# For Railway deployment, DATABASE_URL is provided automatically
# For local development, you can skip database setup and deploy directly to Railway
if not DATABASE_URL:
    print("WARNING: DATABASE_URL not found. This is expected for local development.")
    print("For production, Railway will provide DATABASE_URL automatically.")
    print("Deploy to Railway to use the database.")

def get_connection():
    """Get a database connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


# ---------------------------------------------------------------------
# USERS
# ---------------------------------------------------------------------
def get_or_create_user(name: str, email: str, phone: Optional[str] = None) -> dict:
    """Fetch a user by email, or create one if they don't exist yet."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            existing = cur.fetchone()
            if existing:
                return dict(existing)
            
            cur.execute(
                "INSERT INTO users (name, email, phone) VALUES (%s, %s, %s) RETURNING *",
                (name, email, phone)
            )
            conn.commit()
            return dict(cur.fetchone())
    finally:
        conn.close()


# ---------------------------------------------------------------------
# TRANSACTIONS
# ---------------------------------------------------------------------
def create_transaction(user_id: str, amount: float, status: str, error_code: Optional[str]) -> dict:
    """Insert a new at-risk transaction (failed payment / abandoned checkout)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO transactions (user_id, amount, status, error_code) VALUES (%s, %s, %s, %s) RETURNING *",
                (user_id, amount, status, error_code)
            )
            conn.commit()
            return dict(cur.fetchone())
    finally:
        conn.close()


def update_transaction_status(txn_id: str, status: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE transactions SET status = %s WHERE txn_id = %s", (status, txn_id))
            conn.commit()
    finally:
        conn.close()


def get_transaction(txn_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM transactions WHERE txn_id = %s", (txn_id,))
            result = cur.fetchone()
            return dict(result) if result else None
    finally:
        conn.close()


# ---------------------------------------------------------------------
# AI AUDIT LOGS  (this table IS the audit trail + the stopping-rule state)
# ---------------------------------------------------------------------
def get_logs_for_user(user_id: str) -> list:
    """
    Pull every audit log tied to transactions belonging to this user.
    Used to enforce the "max attempts per user" stopping rule, and to
    check for an existing 'promise_to_pay' from a previous intervention.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT txn_id FROM transactions WHERE user_id = %s", (user_id,))
            txns = cur.fetchall()
            txn_ids = [t["txn_id"] for t in txns] if txns else []
            if not txn_ids:
                return []
            
            cur.execute("SELECT * FROM ai_audit_logs WHERE txn_id = ANY(%s)", (txn_ids,))
            logs = cur.fetchall()
            return [dict(log) for log in logs] if logs else []
    finally:
        conn.close()


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
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ai_audit_logs 
                   (txn_id, root_cause_diagnosed, action_taken, message_sent, money_recovered, status) 
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
                (txn_id, root_cause, action_taken, message_sent, money_recovered, status)
            )
            conn.commit()
            return dict(cur.fetchone())
    finally:
        conn.close()


# ---------------------------------------------------------------------
# DASHBOARD QUERIES
# ---------------------------------------------------------------------
def get_all_audit_logs() -> list:
    """Full audit trail, most recent first — used by the Streamlit dashboard."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM ai_audit_logs ORDER BY timestamp DESC")
            logs = cur.fetchall()
            return [dict(log) for log in logs] if logs else []
    finally:
        conn.close()


def get_total_money_recovered() -> float:
    """Sum of transaction amounts where money_recovered=True in the audit log."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT txn_id FROM ai_audit_logs WHERE money_recovered = TRUE")
            logs = cur.fetchall()
            if not logs:
                return 0.0
            
            total = 0.0
            for log in logs:
                txn = get_transaction(log["txn_id"])
                if txn:
                    total += float(txn["amount"])
            return total
    finally:
        conn.close()


def get_all_transactions() -> list:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM transactions ORDER BY created_at DESC")
            txns = cur.fetchall()
            return [dict(txn) for txn in txns] if txns else []
    finally:
        conn.close()


def delete_all_performance_data() -> dict:
    """Delete all audit logs, transactions, and users to clear performance data."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Delete audit logs first (they reference transactions)
            cur.execute("DELETE FROM ai_audit_logs WHERE log_id IS NOT NULL")
            # Delete transactions (they reference users)
            cur.execute("DELETE FROM transactions WHERE txn_id IS NOT NULL")
            # Delete users
            cur.execute("DELETE FROM users WHERE user_id IS NOT NULL")
            conn.commit()
        return {"status": "success", "message": "All performance data deleted"}
    finally:
        conn.close()
