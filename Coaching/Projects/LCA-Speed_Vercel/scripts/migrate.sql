-- LCA Speed Journal - Initial Schema
-- Run this against your Vercel Postgres database (via dashboard or psql)

-- Athletes roster (athlete_type: 'athlete' | 'staff' | 'alumni'; staff/alumni omit graduating_class)
CREATE TABLE IF NOT EXISTS athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  graduating_class INTEGER,
  athlete_type TEXT NOT NULL DEFAULT 'athlete',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For existing DBs: add athlete_type, make graduating_class nullable
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS athlete_type TEXT NOT NULL DEFAULT 'athlete';
ALTER TABLE athletes ALTER COLUMN graduating_class DROP NOT NULL;

-- Training sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  phase TEXT NOT NULL,
  phase_week INTEGER NOT NULL,
  day_categories JSONB,
  day_metrics JSONB,
  day_splits JSONB,
  day_components JSONB,
  session_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Metric entries (one row per parsed value)
CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  interval_index INTEGER,
  component TEXT,
  value NUMERIC NOT NULL,
  display_value NUMERIC NOT NULL,
  units TEXT NOT NULL,
  raw_input TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_entries_session_metric_value 
  ON entries(session_id, metric_key, value);

-- Coach-only notes per athlete
CREATE TABLE IF NOT EXISTS athlete_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
