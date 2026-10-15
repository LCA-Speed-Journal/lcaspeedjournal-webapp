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

/** Fraction of 1RM for integer reps at an RPE on the chart. */
export function percentOf1Rm(reps: number, rpe: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  if (!Number.isFinite(rpe)) return null;
  if (rpe < 3 || rpe > 10) return null;
  const intensity = 1 - 0.05 * (10 - rpe);
  return MAX_EFFORT[reps] * intensity;
}
