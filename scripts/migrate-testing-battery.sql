-- Testing batteries. Ross runs this. Do not apply from the app.

CREATE TABLE IF NOT EXISTS testing_batteries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  hugo_group TEXT NOT NULL,
  grouping_mode TEXT NOT NULL CHECK (grouping_mode IN ('subteam', 'cutoff')),
  cutoff_n INTEGER,
  senior_grad_year INTEGER NOT NULL,
  comparison_session_id UUID REFERENCES sessions(id),
  bibs_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testing_battery_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battery_id UUID NOT NULL REFERENCES testing_batteries(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  label TEXT NOT NULL,
  session_date DATE,
  session_id UUID REFERENCES sessions(id),
  sort_order INTEGER NOT NULL,
  rest_seconds INTEGER,
  closed_at TIMESTAMPTZ,
  locked_dri_box TEXT,
  UNIQUE (battery_id, day_key)
);

CREATE TABLE IF NOT EXISTS testing_battery_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battery_id UUID NOT NULL REFERENCES testing_batteries(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE (battery_id, group_key)
);

CREATE TABLE IF NOT EXISTS testing_battery_group_members (
  group_id UUID NOT NULL REFERENCES testing_battery_groups(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS testing_battery_bibs (
  battery_id UUID NOT NULL REFERENCES testing_batteries(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  bib TEXT NOT NULL,
  grade_digit INTEGER NOT NULL,
  alpha_index INTEGER NOT NULL,
  PRIMARY KEY (battery_id, athlete_id),
  UNIQUE (battery_id, bib)
);

CREATE TABLE IF NOT EXISTS testing_battery_lane_sheets (
  battery_id UUID PRIMARY KEY REFERENCES testing_batteries(id) ON DELETE CASCADE,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heats JSONB NOT NULL
);

ALTER TABLE entries ADD COLUMN IF NOT EXISTS qualifier TEXT;
