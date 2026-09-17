-- Widen Hugo group CHECKs for Women's Tennis, Women's Soccer, Nordic Ski, and Golf.
-- Safe to re-run. CREATE TABLE IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS will
-- not replace an old CHECK, so drop then add.

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

ALTER TABLE norm_sport_defaults
  DROP CONSTRAINT IF EXISTS norm_sport_defaults_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'norm_sport_defaults_group_check'
  ) THEN
    ALTER TABLE norm_sport_defaults
      ADD CONSTRAINT norm_sport_defaults_group_check
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
