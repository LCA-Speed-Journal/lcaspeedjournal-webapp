-- Manual log remembers exercises the coach removed or replaced, so reopening
-- the sheet does not rebuild those rows from the printed card.
-- Safe to re-run. Run on each database before the app reads log_suppressed.

ALTER TABLE workout_movements
  ADD COLUMN IF NOT EXISTS log_suppressed BOOLEAN NOT NULL DEFAULT false;
