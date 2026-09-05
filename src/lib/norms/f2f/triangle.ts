import { TRIANGLE_FAST_PAD, TRIANGLE_SLOW_PAD } from "./constants";

export function vertexRadius(
  predicted40: number,
  reference40: number
): number {
  if (!Number.isFinite(predicted40) || !Number.isFinite(reference40) || reference40 <= 0) {
    return 0;
  }

  const slow = reference40 * (1 + TRIANGLE_SLOW_PAD);
  const fast = reference40 * (1 - TRIANGLE_FAST_PAD);
  const span = slow - fast;
  if (span === 0) return 0;

  const t = (slow - predicted40) / span;
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t));
}
