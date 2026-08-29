-- Safe to re-run. Source of truth for Hugo team rosters (multi-sport).
CREATE TABLE IF NOT EXISTS athlete_hugo_memberships (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  hugo_group TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, hugo_group),
  CONSTRAINT athlete_hugo_memberships_group_check CHECK (
    hugo_group IN (
      'soccer',
      'volleyball',
      'xc',
      'extracurricular',
      'mens_basketball',
      'womens_basketball',
      'track',
      'baseball'
    )
  )
);
CREATE INDEX IF NOT EXISTS idx_athlete_hugo_memberships_group
  ON athlete_hugo_memberships(hugo_group);

INSERT INTO athlete_hugo_memberships (athlete_id, hugo_group)
SELECT id, hugo_group
FROM athletes
WHERE hugo_group IS NOT NULL
ON CONFLICT (athlete_id, hugo_group) DO NOTHING;
