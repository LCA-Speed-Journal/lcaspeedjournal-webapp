-- Normalize jump metrics to feet for leaderboard display
-- Use when entries were stored in inches (e.g. Seated-Broad on 3/26) or meters (e.g. Triple-Broad, Standing-Triple)
-- and the leaderboard shows "ft" but values are wrong. Run against your Postgres DB (Vercel/Neon Query or psql).
--
-- Backup: Consider backing up entries before running, or run in a transaction and COMMIT after verifying.

BEGIN;

-- 1. Horizontal jumps stored in INCHES -> convert to feet (display_value / 12), set units = 'ft'
-- Affects: Seated-Broad, Standing-Broad, MB-Broad, Depth-Broad_8, Depth-Broad_12, Depth-Broad_18
UPDATE entries
SET
  display_value = ROUND((display_value / 12)::numeric, 4),
  units = 'ft'
WHERE units IN ('in', 'inch', 'inches')
  AND metric_key IN (
    'Seated-Broad', 'Standing-Broad', 'MB-Broad',
    'Depth-Broad_8', 'Depth-Broad_12', 'Depth-Broad_18'
  );

-- 2. Jumps stored in METERS -> convert to feet (display_value * 3.28084), set units = 'ft'
-- Affects: Triple-Broad, Standing-Triple, 5-Bound (and any other m -> ft metric)
UPDATE entries
SET
  display_value = ROUND((display_value * 3.28084)::numeric, 4),
  units = 'ft'
WHERE units IN ('m', 'meter', 'meters')
  AND metric_key IN ('Triple-Broad', 'Standing-Triple', '5-Bound');

-- Optional: show how many rows were updated (run as separate SELECT after COMMIT to verify)
-- SELECT metric_key, units, COUNT(*) FROM entries WHERE metric_key IN ('Seated-Broad','Standing-Broad','Triple-Broad','Standing-Triple') GROUP BY metric_key, units ORDER BY metric_key, units;

COMMIT;
