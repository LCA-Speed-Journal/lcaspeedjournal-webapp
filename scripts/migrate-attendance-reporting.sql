-- Attendance reporting: enrollment, practice rhythm, session edits, varsity games.
-- Safe to re-run. CREATE TABLE IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS will
-- not replace an old CHECK, so drop then add. Seed uses ON CONFLICT DO NOTHING
-- so a later coach edit is not overwritten. Does not backfill enrollment.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS enrollment TEXT;

ALTER TABLE athletes DROP CONSTRAINT IF EXISTS athletes_enrollment_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athletes_enrollment_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_enrollment_check
      CHECK (enrollment IS NULL OR enrollment IN ('liberty', 'homeschool', 'coop'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sport_practice_rhythms (
  hugo_group TEXT PRIMARY KEY,
  weekdays SMALLINT[] NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_session_edits (
  hugo_group TEXT NOT NULL,
  session_date DATE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add', 'cancel')),
  PRIMARY KEY (hugo_group, session_date)
);

CREATE TABLE IF NOT EXISTS varsity_contests (
  hugo_group TEXT NOT NULL,
  contest_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('bound', 'manual')),
  bound_key TEXT,
  label TEXT,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (hugo_group, contest_date)
);

ALTER TABLE sport_practice_rhythms
  DROP CONSTRAINT IF EXISTS sport_practice_rhythms_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sport_practice_rhythms_group_check'
  ) THEN
    ALTER TABLE sport_practice_rhythms
      ADD CONSTRAINT sport_practice_rhythms_group_check
      CHECK (
        hugo_group IN (
          'soccer',
          'volleyball',
          'xc',
          'football',
          'womens_tennis',
          'womens_soccer',
          'extracurricular',
          'mens_basketball',
          'womens_basketball',
          'nordic_ski',
          'track',
          'baseball',
          'golf'
        )
      );
  END IF;
END $$;

ALTER TABLE attendance_session_edits
  DROP CONSTRAINT IF EXISTS attendance_session_edits_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_edits_group_check'
  ) THEN
    ALTER TABLE attendance_session_edits
      ADD CONSTRAINT attendance_session_edits_group_check
      CHECK (
        hugo_group IN (
          'soccer',
          'volleyball',
          'xc',
          'football',
          'womens_tennis',
          'womens_soccer',
          'extracurricular',
          'mens_basketball',
          'womens_basketball',
          'nordic_ski',
          'track',
          'baseball',
          'golf'
        )
      );
  END IF;
END $$;

ALTER TABLE varsity_contests
  DROP CONSTRAINT IF EXISTS varsity_contests_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'varsity_contests_group_check'
  ) THEN
    ALTER TABLE varsity_contests
      ADD CONSTRAINT varsity_contests_group_check
      CHECK (
        hugo_group IN (
          'soccer',
          'volleyball',
          'xc',
          'football',
          'womens_tennis',
          'womens_soccer',
          'extracurricular',
          'mens_basketball',
          'womens_basketball',
          'nordic_ski',
          'track',
          'baseball',
          'golf'
        )
      );
  END IF;
END $$;

INSERT INTO sport_practice_rhythms (hugo_group, weekdays)
VALUES
  ('volleyball', '{1,3}'::smallint[]),
  ('soccer', '{2,5}'::smallint[]),
  ('xc', '{1,4}'::smallint[]),
  ('football', '{1,4}'::smallint[]),
  ('womens_tennis', '{1,4}'::smallint[]),
  ('womens_soccer', '{1,4}'::smallint[])
ON CONFLICT DO NOTHING;
