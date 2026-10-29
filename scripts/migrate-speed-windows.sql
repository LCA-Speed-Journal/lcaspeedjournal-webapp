ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS distance_unit TEXT,
  ADD COLUMN IF NOT EXISTS start_distance NUMERIC,
  ADD COLUMN IF NOT EXISTS end_distance NUMERIC,
  ADD COLUMN IF NOT EXISTS legacy_metric_key TEXT,
  ADD COLUMN IF NOT EXISTS legacy_component TEXT;

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_distance_unit_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_distance_unit_check
  CHECK (distance_unit IS NULL OR distance_unit IN ('m', 'yd'));

CREATE INDEX IF NOT EXISTS idx_entries_speed_window
  ON entries (metric_key, distance_unit, start_distance, end_distance);
