-- Copy the typed distance into display_value where the board was converted the wrong way.
--
-- Seated-Broad (2024-04-11, 2024-05-03, 2025-03-26): coaches typed decimal feet.
-- value and raw_input hold that feet number. display_value is value * 12, so the
-- board shows inches under a feet label (67-114 instead of about 5.6-9.5 ft).
--
-- Standing-Triple (2024-04-04, 2025-03-26) and Triple-Broad (2024-03-28,
-- 2024-04-22, 2024-04-25, 2025-03-26): coaches typed feet. display_value is
-- value / 3.281, so the board shows meters under a feet label (about 4-10
-- instead of 14-31 ft). The 2026 days already show feet (ratio 3.281) and
-- this script leaves them alone.
--
-- Expected on a database that has not been fixed yet: 79 seated, 71 standing
-- triple, 142 triple broad. Running it again matches 0 rows and does nothing.
-- Any other count aborts the transaction.
--
-- Run this BEFORE scripts/migrate-measured-unit.sql.
-- Do NOT run scripts/migrate-normalize-jump-units-to-ft.sql. That script keys
-- off the units column, which is split between ft and in/m on the same day,
-- so it would fix only half of these rows and would multiply the triple-jump
-- rows that are already labeled m.

BEGIN;

ALTER TABLE entries ADD COLUMN IF NOT EXISTS measured_unit text;

DO $$
DECLARE
  seated int;
  standing_triple int;
  triple_broad int;
BEGIN
  SELECT count(*) INTO seated
  FROM entries
  WHERE metric_key = 'Seated-Broad'
    AND value IS NOT NULL AND value <> 0
    AND abs((display_value / value) - 12) < 0.02;

  SELECT count(*) INTO standing_triple
  FROM entries
  WHERE metric_key = 'Standing-Triple'
    AND value IS NOT NULL AND value <> 0
    AND abs((display_value / value) - (1.0 / 3.281)) < 0.01;

  SELECT count(*) INTO triple_broad
  FROM entries
  WHERE metric_key = 'Triple-Broad'
    AND value IS NOT NULL AND value <> 0
    AND abs((display_value / value) - (1.0 / 3.281)) < 0.01;

  IF seated NOT IN (0, 79)
     OR standing_triple NOT IN (0, 71)
     OR triple_broad NOT IN (0, 142) THEN
    RAISE EXCEPTION
      'Unexpected swapped-distance counts (seated %, standing triple %, triple broad %). Expected 79/71/142, or 0/0/0 if this script already ran.',
      seated, standing_triple, triple_broad;
  END IF;
END $$;

-- Typed feet are already in value. Show those on the board, and remember that
-- a later edit of the bare number (5.6, 28.08) is decimal feet, not cm or m.
UPDATE entries
SET
  display_value = value,
  units = 'ft',
  measured_unit = 'ft_in'
WHERE metric_key = 'Seated-Broad'
  AND value IS NOT NULL AND value <> 0
  AND abs((display_value / value) - 12) < 0.02;

UPDATE entries
SET
  display_value = value,
  units = 'ft',
  measured_unit = 'ft_in'
WHERE metric_key IN ('Standing-Triple', 'Triple-Broad')
  AND value IS NOT NULL AND value <> 0
  AND abs((display_value / value) - (1.0 / 3.281)) < 0.01;

COMMIT;
