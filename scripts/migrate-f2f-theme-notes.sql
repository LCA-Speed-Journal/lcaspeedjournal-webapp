-- Persist coach Force-to-Form theme-note overrides on testing-day sessions.
-- Safe to run on existing databases.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS f2f_theme_notes JSONB NOT NULL DEFAULT '{}'::jsonb;
