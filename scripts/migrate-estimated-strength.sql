-- Coach-adjusted RPE for one logged set. NULL means "use the card target".
ALTER TABLE set_results
  ADD COLUMN IF NOT EXISTS rpe_override NUMERIC;

-- One current baseline per athlete per pattern.
-- origin 'anchor' is a coach-entered squat, bench, or power clean.
-- origin 'seed' is the one-time snapshot for hinge, single-leg, or pull.
-- origin 'edit' is a coach override of any pattern.
CREATE TABLE IF NOT EXISTS athlete_strength_baselines (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  value_lb NUMERIC NOT NULL,
  origin TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, pattern)
);
