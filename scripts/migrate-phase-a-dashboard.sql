-- Phase A: Manage Athletes Dashboard - Schema Changes
-- Date: 2026-02-02
-- Purpose: Add active flag, event groups, presets, archetypes, and flags tables

-- 1. Add active flag to athletes
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- 2. Event groups (configurable categories like "Sprints", "Horizontal Jumps")
CREATE TABLE IF NOT EXISTS event_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Athlete event group assignments (many-to-many)
CREATE TABLE IF NOT EXISTS athlete_event_groups (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  event_group_id UUID NOT NULL REFERENCES event_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, event_group_id)
);

-- 4. Superpower presets (configurable list)
CREATE TABLE IF NOT EXISTS superpower_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Kryptonite presets (configurable list)
CREATE TABLE IF NOT EXISTS kryptonite_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Athlete superpowers (preset or custom)
CREATE TABLE IF NOT EXISTS athlete_superpowers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES superpower_presets(id) ON DELETE SET NULL,
  custom_text TEXT,
  detail TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT superpower_preset_or_custom CHECK (
    (preset_id IS NOT NULL AND custom_text IS NULL) OR
    (preset_id IS NULL AND custom_text IS NOT NULL)
  )
);

-- 7. Athlete kryptonite (preset or custom)
CREATE TABLE IF NOT EXISTS athlete_kryptonite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES kryptonite_presets(id) ON DELETE SET NULL,
  custom_text TEXT,
  detail TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kryptonite_preset_or_custom CHECK (
    (preset_id IS NOT NULL AND custom_text IS NULL) OR
    (preset_id IS NULL AND custom_text IS NOT NULL)
  )
);

-- 8. Athlete archetypes (coach-assigned qualitative assessments)
CREATE TABLE IF NOT EXISTS athlete_archetypes (
  athlete_id UUID PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE,
  rsi_type TEXT CHECK (rsi_type IN ('elastic', 'force', 'high_rsi', 'low_rsi', 'unset')),
  sprint_archetype TEXT CHECK (sprint_archetype IN ('bouncer', 'spinner', 'bounder', 'driver', 'unset')),
  force_velocity_scale INTEGER CHECK (force_velocity_scale BETWEEN 1 AND 5 OR force_velocity_scale IS NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Athlete flags (system-suggested and coach-added)
CREATE TABLE IF NOT EXISTS athlete_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('system', 'coach')),
  title TEXT NOT NULL,
  description TEXT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  metric_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_athlete_event_groups_athlete ON athlete_event_groups(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_event_groups_event ON athlete_event_groups(event_group_id);
CREATE INDEX IF NOT EXISTS idx_athlete_superpowers_athlete ON athlete_superpowers(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_kryptonite_athlete ON athlete_kryptonite(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_flags_athlete ON athlete_flags(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_flags_resolved ON athlete_flags(resolved_at) WHERE resolved_at IS NULL;

-- Seed some default event groups (optional, can be managed via UI)
INSERT INTO event_groups (name, display_order) VALUES
  ('Sprints', 1),
  ('Horizontal Jumps', 2),
  ('Vertical Jumps', 3),
  ('Hurdles', 4),
  ('Distance', 5),
  ('Throws', 6)
ON CONFLICT (name) DO NOTHING;
