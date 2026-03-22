-- Optional indexes for reporting export/summary (date-range scans on sessions + entry joins).
-- Run after EXPLAIN shows seq scans on production-like data; safe to apply if missing.

CREATE INDEX IF NOT EXISTS idx_sessions_session_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_entries_session_id ON entries(session_id);
