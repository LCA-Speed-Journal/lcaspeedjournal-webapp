-- Day B is bench + hex. The board heading reads testing_battery_days.label,
-- which was copied from the template when the battery was created.
UPDATE testing_battery_days AS d
SET label = 'Strength'
FROM testing_batteries AS b
WHERE d.battery_id = b.id
  AND b.hugo_group = 'mens_basketball'
  AND d.day_key = 'B'
  AND d.label = 'Upper Body';
