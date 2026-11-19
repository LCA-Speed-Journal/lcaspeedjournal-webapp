-- DO NOT RUN.
--
-- This was an earlier attempt to fix Seated-Broad on 3/26 and the triple jumps.
-- It only converts rows whose units column is in or m. On those days the units
-- column is split between ft and in/m, while display_value is wrong on both
-- halves. Running this would fix half the rows and would multiply the
-- triple-jump rows already labeled m.
--
-- Use scripts/migrate-fix-swapped-distance-display.sql instead, then
-- scripts/migrate-measured-unit.sql.

DO $$
BEGIN
  RAISE EXCEPTION
    'Do not run migrate-normalize-jump-units-to-ft.sql. Run migrate-fix-swapped-distance-display.sql, then migrate-measured-unit.sql.';
END $$;

-- Retired updates, kept so the old approach stays visible. They are not executed.
--
-- UPDATE entries
-- SET display_value = ROUND((display_value / 12)::numeric, 4), units = 'ft'
-- WHERE units IN ('in', 'inch', 'inches')
--   AND metric_key IN (
--     'Seated-Broad', 'Standing-Broad', 'MB-Broad',
--     'Depth-Broad_8', 'Depth-Broad_12', 'Depth-Broad_18'
--   );
--
-- UPDATE entries
-- SET display_value = ROUND((display_value * 3.28084)::numeric, 4), units = 'ft'
-- WHERE units IN ('m', 'meter', 'meters')
--   AND metric_key IN ('Triple-Broad', 'Standing-Triple', '5-Bound');
