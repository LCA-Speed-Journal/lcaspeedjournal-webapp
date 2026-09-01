-- Backfill is_primary on existing athlete_hugo_memberships.
-- Safe to re-run. Same statements as scripts/migrate-normative-data.sql §3b.
-- attachZones only uses is_primary memberships. DEFAULT false left every
-- pre-migration athlete unbadged until a coach clicked Primary.
--
-- 1. Exactly one membership and no primary → that row.
-- 2. Multiple memberships, no primary, athletes.hugo_group matches one row → that row.
-- 3. Remaining dual-sport with no scalar match stay unbadged (coach chooses).
-- Never creates two primaries (partial unique index athlete_hugo_memberships_one_primary).

UPDATE athlete_hugo_memberships m
SET is_primary = true
WHERE m.is_primary = false
  AND NOT EXISTS (
    SELECT 1
    FROM athlete_hugo_memberships p
    WHERE p.athlete_id = m.athlete_id
      AND p.is_primary = true
  )
  AND (
    SELECT COUNT(*)
    FROM athlete_hugo_memberships c
    WHERE c.athlete_id = m.athlete_id
  ) = 1;

UPDATE athlete_hugo_memberships m
SET is_primary = true
FROM athletes a
WHERE a.id = m.athlete_id
  AND m.is_primary = false
  AND a.hugo_group IS NOT NULL
  AND m.hugo_group = a.hugo_group
  AND NOT EXISTS (
    SELECT 1
    FROM athlete_hugo_memberships p
    WHERE p.athlete_id = m.athlete_id
      AND p.is_primary = true
  );
