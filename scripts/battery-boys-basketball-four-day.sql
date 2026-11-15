-- Ross runs this. The app does not. No entries are deleted.
-- Selects testing_batteries by exact title and hugo_group. If more than one
-- row matches, each is updated only because the title is Boys Basketball Baseline.
-- Day B and day C keep closed_at and locked_dri_box. Session links are cleared
-- only when the linked sessions.session_date is a different day. Entries stay.

BEGIN;

CREATE TEMP TABLE "selected_batteries" ON COMMIT DROP AS
SELECT "id"
FROM "testing_batteries"
WHERE "title" = 'Boys Basketball Baseline'
  AND "hugo_group" = 'mens_basketball';

UPDATE "testing_battery_days" AS "d"
SET
  "label" = 'Upper Body',
  "session_date" = DATE '2026-11-17',
  "session_id" = CASE
    WHEN (
      SELECT "s"."session_date"
      FROM "sessions" AS "s"
      WHERE "s"."id" = "d"."session_id"
    ) = DATE '2026-11-17'
    THEN "d"."session_id"
    ELSE NULL
  END
WHERE "d"."day_key" = 'B'
  AND "d"."battery_id" IN (SELECT "id" FROM "selected_batteries");

UPDATE "testing_battery_days" AS "d"
SET
  "label" = 'Power',
  "session_date" = DATE '2026-11-19',
  "rest_seconds" = NULL,
  "session_id" = CASE
    WHEN (
      SELECT "s"."session_date"
      FROM "sessions" AS "s"
      WHERE "s"."id" = "d"."session_id"
    ) = DATE '2026-11-19'
    THEN "d"."session_id"
    ELSE NULL
  END
WHERE "d"."day_key" = 'C'
  AND "d"."battery_id" IN (SELECT "id" FROM "selected_batteries");

INSERT INTO "testing_battery_days" (
  "battery_id",
  "day_key",
  "label",
  "session_date",
  "session_id",
  "sort_order",
  "rest_seconds"
)
SELECT
  "b"."id",
  'D',
  'Capacity',
  DATE '2026-11-20',
  NULL,
  4,
  10
FROM "selected_batteries" AS "b"
WHERE NOT EXISTS (
  SELECT 1
  FROM "testing_battery_days" AS "existing"
  WHERE "existing"."battery_id" = "b"."id"
    AND "existing"."day_key" = 'D'
)
ON CONFLICT ("battery_id", "day_key") DO NOTHING;

COMMIT;
