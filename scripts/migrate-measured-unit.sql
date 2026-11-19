ALTER TABLE entries ADD COLUMN IF NOT EXISTS measured_unit text;

UPDATE entries
SET measured_unit = 'cm'
WHERE measured_unit IS NULL
  AND metric_key IN (
    'Seated-Broad', 'Standing-Broad', 'MB-Broad',
    'Depth-Broad_8', 'Depth-Broad_12', 'Depth-Broad_18'
  );

UPDATE entries
SET measured_unit = 'm'
WHERE measured_unit IS NULL
  AND metric_key IN ('Triple-Broad', 'OH-MB_Throw', 'UH-MB_Throw');
