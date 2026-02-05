-- Optional: index for faster progression queries (best per session per athlete+metric).
-- Run manually against your Postgres DB if progression queries feel slow on large data.
CREATE INDEX IF NOT EXISTS idx_entries_athlete_metric
  ON entries(athlete_id, metric_key);
