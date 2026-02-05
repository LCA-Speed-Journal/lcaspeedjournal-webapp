-- Add athlete_type for Staff and Alumni (outreach events)
-- Run this after migrate.sql. Safe to run on existing databases.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS athlete_type TEXT NOT NULL DEFAULT 'athlete';
ALTER TABLE athletes ALTER COLUMN graduating_class DROP NOT NULL;
