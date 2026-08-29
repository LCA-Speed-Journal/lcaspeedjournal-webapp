-- Hugo Weight-Room module: athlete groups, stickers, workout templates, scans, and lift logs.
-- Does not write into entries. Safe to re-run.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hugo_group TEXT;

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
          'extracurricular',
          'mens_basketball',
          'womens_basketball',
          'track',
          'baseball'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS athlete_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  payload TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_athlete_stickers_athlete_id ON athlete_stickers(athlete_id);

CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hugo_group TEXT NOT NULL,
  week_number INTEGER,
  day_name TEXT,
  session_date DATE NOT NULL,
  focus TEXT NOT NULL,
  title TEXT NOT NULL,
  layout TEXT NOT NULL DEFAULT 'landscape-letter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_templates_group_date
  ON workout_templates(hugo_group, session_date);

CREATE TABLE IF NOT EXISTS workout_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  sort_index INTEGER NOT NULL,
  label TEXT,
  name TEXT NOT NULL,
  block TEXT NOT NULL,
  set_count INTEGER NOT NULL,
  targets JSONB NOT NULL,
  notes TEXT,
  from_pair BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_workout_movements_template_id ON workout_movements(template_id);

CREATE TABLE IF NOT EXISTS card_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blob_url TEXT NOT NULL,
  template_id UUID REFERENCES workout_templates(id),
  athlete_id UUID REFERENCES athletes(id),
  sticker_payload TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  extraction JSONB,
  error TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_card_scans_status ON card_scans(status);

CREATE TABLE IF NOT EXISTS session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES workout_templates(id),
  scan_id UUID REFERENCES card_scans(id),
  session_date DATE NOT NULL,
  hugo_group TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_session_logs_group_date ON session_logs(hugo_group, session_date);

CREATE TABLE IF NOT EXISTS set_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_log_id UUID NOT NULL REFERENCES session_logs(id) ON DELETE CASCADE,
  movement_id UUID NOT NULL REFERENCES workout_movements(id),
  set_index INTEGER NOT NULL,
  raw_text TEXT,
  kind TEXT,
  load NUMERIC,
  reps NUMERIC,
  units TEXT,
  corrected BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (session_log_id, movement_id, set_index)
);
