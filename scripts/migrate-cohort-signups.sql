-- Fall S&C Back to School Night cohort signups
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS cohort_config (
  id TEXT PRIMARY KEY,
  capacity INTEGER NOT NULL DEFAULT 12,
  title TEXT NOT NULL DEFAULT 'Fall Strength & Conditioning',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cohort_config (id, capacity, title)
VALUES ('fall-sc', 12, 'Fall Strength & Conditioning')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cohort_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT,
  grade TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_signups_created_at
  ON cohort_signups (created_at);
