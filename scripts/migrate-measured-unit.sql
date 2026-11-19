-- Remember the unit that was typed on older distance rows, so a later edit
-- re-reads the raw text in that unit instead of today's default.
--
-- Run scripts/migrate-fix-swapped-distance-display.sql FIRST. That script
-- marks the swapped seated-broad and triple-jump rows as ft_in. This script
-- only fills rows that are still null, so it will not overwrite those.
--
-- Seated-Broad is not in the centimeter list. Every stored seated broad was
-- typed as decimal feet. Standing broad value is still centimeters, so those
-- rows stay cm. 2026 Triple-Broad rows (value in meters, display in feet)
-- stay m. The 2024-2025 triple rows are already ft_in from the display fix.

ALTER TABLE entries ADD COLUMN IF NOT EXISTS measured_unit text;

UPDATE entries
SET measured_unit = 'cm'
WHERE measured_unit IS NULL
  AND metric_key IN (
    'Standing-Broad', 'MB-Broad',
    'Depth-Broad_8', 'Depth-Broad_12', 'Depth-Broad_18'
  )
  AND created_at < '2026-11-20';

UPDATE entries
SET measured_unit = 'm'
WHERE measured_unit IS NULL
  AND metric_key IN ('Triple-Broad', 'OH-MB_Throw', 'UH-MB_Throw')
  AND created_at < '2026-11-20'
  AND NOT (
    metric_key = 'Triple-Broad'
    AND value IS NOT NULL
    AND value <> 0
    AND abs((display_value / value) - (1.0 / 3.281)) < 0.01
  );
