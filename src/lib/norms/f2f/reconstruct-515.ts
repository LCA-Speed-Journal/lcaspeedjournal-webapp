import { mphFromYardSplit } from "../forty-yd";

export type ReconstructedFiveFifteen = { timeS: number; mph: number };

export function reconstructFiveFifteen(
  t5to10: number,
  t10to20: number
): ReconstructedFiveFifteen | null {
  if (!Number.isFinite(t5to10) || !Number.isFinite(t10to20)) return null;
  if (t5to10 <= 0 || t10to20 <= 0) return null;

  const t1 = t5to10;
  const t2 = t10to20;
  const T = t1 + t2;
  const a = (10 * (2 * t1 - t2)) / (t1 * t2 * T);
  const v = 5 / t1 - 0.5 * a * t1;
  if (!Number.isFinite(a) || !Number.isFinite(v) || v <= 0) return null;

  let timeS: number;
  if (Math.abs(a) < 1e-12) {
    timeS = 10 / v;
  } else {
    const disc = v * v + 20 * a;
    if (disc < 0) return null;
    timeS = (-v + Math.sqrt(disc)) / a;
  }
  if (!Number.isFinite(timeS) || timeS <= t1 || timeS >= T) return null;

  const mph = mphFromYardSplit(timeS, 10);
  if (mph == null) return null;
  return { timeS, mph };
}
