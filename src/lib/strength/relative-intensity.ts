/** Max-effort row of the Liberty chart. Reps 7 and 9 are midpoints. */
const MAX_EFFORT: Record<number, number> = {
  1: 1,
  2: 0.95,
  3: 0.925,
  4: 0.9,
  5: 0.875,
  6: 0.85,
  7: 0.825,
  8: 0.8,
  9: 0.7625,
  10: 0.725,
};

/**
 * Fraction of 1RM for integer reps at an RPE on the chart.
 * Reps outside 1–10 stay null. Estimates use `percentOf1RmExtended`
 * so a 12- or 15-rep goblet, and a doubled lunge, still have a percent.
 */
export function percentOf1Rm(reps: number, rpe: number): number | null {
  return percentWithin(reps, rpe, 10);
}

/**
 * Same chart, continued through 20 reps.
 * From 8 reps (0.80) to 10 reps (0.725) the table drops 0.0375 per rep.
 * Reps 11–20 keep that step so a doubled lunge still has a percent.
 */
export function percentOf1RmExtended(reps: number, rpe: number): number | null {
  return percentWithin(reps, rpe, 20);
}

function maxEffortFraction(reps: number): number | null {
  const known = MAX_EFFORT[reps];
  if (known != null) return known;
  if (!Number.isInteger(reps) || reps < 11 || reps > 20) return null;
  return (7250 - 375 * (reps - 10)) / 10000;
}

function percentWithin(reps: number, rpe: number, maxReps: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > maxReps) return null;
  if (!Number.isFinite(rpe) || rpe < 3 || rpe > 10) return null;
  const maxEffort = maxEffortFraction(reps);
  if (maxEffort == null || maxEffort <= 0) return null;
  const intensity = 1 - 0.05 * (10 - rpe);
  return maxEffort * intensity;
}
