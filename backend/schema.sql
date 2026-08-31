-- Railway PostgreSQL Schema for AI Revenue Recovery Agent
-- Run this in Railway PostgreSQL database after deployment

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    txn_id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Audit Logs table
CREATE TABLE IF NOT EXISTS ai_audit_logs (
    log_id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    txn_id VARCHAR(255) NOT NULL REFERENCES transactions(txn_id) ON DELETE CASCADE,
    root_cause_diagnosed TEXT,
    action_taken VARCHAR(100) NOT NULL,
    message_sent TEXT,
    money_recovered BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'promise_pending',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_txn_id ON ai_audit_logs(txn_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON ai_audit_logs(timestamp DESC);
