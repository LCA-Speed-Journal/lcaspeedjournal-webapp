-- Normative data: populations, thresholds, sport defaults, football Hugo group,
-- primary membership, and weight-room journal dual-write columns.
-- Safe to re-run.

-- 1. Widen Hugo group CHECKs to include football.
-- CREATE TABLE IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS will not replace an
-- old CHECK, so drop then add.

ALTER TABLE athletes DROP CONSTRAINT IF EXISTS athletes_hugo_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athletes_hugo_group_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_hugo_group_check
      CHECK (
        hugo_group IS NULL
        OR hugo_group IN (
          'soccer',
          'volleyball',
          'xc',
          'football',
          'extracurricular',
          'mens_basketball',
          'womens_basketball',
          'track',
          'baseball'
        )
      );
  END IF;
END $$;

ALTER TABLE athlete_hugo_memberships
  DROP CONSTRAINT IF EXISTS athlete_hugo_memberships_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athlete_hugo_memberships_group_check'
  ) THEN
    ALTER TABLE athlete_hugo_memberships
      ADD CONSTRAINT athlete_hugo_memberships_group_check
      CHECK (
        hugo_group IN (
          'soccer',
          'volleyball',
          'xc',
          'football',
          'extracurricular',
          'mens_basketball',
          'womens_basketball',
          'track',
          'baseball'
        )
      );
  END IF;
END $$;

-- workout_templates / session_logs have no hugo_group CHECK (see migrate-weight-room.sql).

-- 2. Primary Hugo sport per athlete
ALTER TABLE athlete_hugo_memberships
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- 3. At most one primary membership per athlete
CREATE UNIQUE INDEX IF NOT EXISTS athlete_hugo_memberships_one_primary
  ON athlete_hugo_memberships (athlete_id)
  WHERE is_primary;

-- 3b. Backfill is_primary on existing memberships (safe to re-run).
-- attachZones only uses is_primary memberships. DEFAULT false left every
-- pre-migration athlete unbadged until a coach clicked Primary.
--
-- 1. Exactly one membership and no primary → that row.
-- 2. Multiple memberships, no primary, athletes.hugo_group matches one row → that row.
-- 3. Remaining dual-sport with no scalar match stay unbadged (coach chooses).
-- Never creates two primaries (partial unique index above).

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

-- 4. Weight-room auto sessions (NULL = coach-created)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS origin TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_origin_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_origin_check
      CHECK (origin IS NULL OR origin = 'weight_room');
  END IF;
END $$;

-- 5. Dual-write marker on entries (NULL = coach-entered)
ALTER TABLE entries ADD COLUMN IF NOT EXISTS source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entries_source_check'
  ) THEN
    ALTER TABLE entries
      ADD CONSTRAINT entries_source_check
      CHECK (source IS NULL OR source = 'weight_room');
  END IF;
END $$;

-- 6. Upsert key for weight-room journal posts (component so 40yd splits don't collide)
DROP INDEX IF EXISTS entries_wr_upsert;
CREATE UNIQUE INDEX IF NOT EXISTS entries_wr_upsert
  ON entries (session_id, athlete_id, metric_key, (COALESCE(component, '')))
  WHERE source = 'weight_room';

-- 7. Map a card movement to a Speed Journal metric (NULL = unmapped)
ALTER TABLE workout_movements
  ADD COLUMN IF NOT EXISTS speed_journal_metric_key TEXT;

ALTER TABLE workout_movements
  ADD COLUMN IF NOT EXISTS speed_journal_component TEXT;

-- 8. Norm tables
CREATE TABLE IF NOT EXISTS norm_populations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS norm_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  population_id UUID NOT NULL REFERENCES norm_populations(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  gender TEXT NOT NULL,
  component TEXT NULL,
  label TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  CONSTRAINT norm_thresholds_gender_check CHECK (gender IN ('M', 'F')),
  CONSTRAINT norm_thresholds_label_check CHECK (
    label IN (
      'poor',
      'developmental',
      'efficient',
      'advanced',
      'elite',
      'world-class'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS norm_thresholds_unique_cut
  ON norm_thresholds (
    population_id,
    metric_key,
    gender,
    (COALESCE(component, '')),
    label
  );

CREATE TABLE IF NOT EXISTS norm_sport_defaults (
  hugo_group TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  population_id UUID NOT NULL REFERENCES norm_populations(id) ON DELETE RESTRICT,
  UNIQUE (hugo_group, metric_key),
  CONSTRAINT norm_sport_defaults_group_check CHECK (
    hugo_group IN (
      'soccer',
      'volleyball',
      'xc',
      'football',
      'extracurricular',
      'mens_basketball',
      'womens_basketball',
      'track',
      'baseball'
    )
  )
);

-- 9. Seed names only — no threshold numbers
INSERT INTO norm_populations (name)
VALUES
  ('HS Volleyball VJ'),
  ('Football Skill 40yd')
ON CONFLICT (name) DO NOTHING;

INSERT INTO norm_sport_defaults (hugo_group, metric_key, population_id)
SELECT 'volleyball', 'Vertical Jump', id
FROM norm_populations
WHERE name = 'HS Volleyball VJ'
ON CONFLICT (hugo_group, metric_key) DO NOTHING;

INSERT INTO norm_sport_defaults (hugo_group, metric_key, population_id)
SELECT 'football', '40yd_Dash', id
FROM norm_populations
WHERE name = 'Football Skill 40yd'
ON CONFLICT (hugo_group, metric_key) DO NOTHING;

INSERT INTO norm_sport_defaults (hugo_group, metric_key, population_id)
SELECT 'soccer', '40yd_Dash', id
FROM norm_populations
WHERE name = 'Football Skill 40yd'
ON CONFLICT (hugo_group, metric_key) DO NOTHING;
