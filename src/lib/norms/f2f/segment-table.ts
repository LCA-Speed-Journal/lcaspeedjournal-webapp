import type { SlowTailFit } from "./lookup";
import segments from "./tables/40yd-segments.json";

type SegmentRow = {
  predicted_40: number;
  t_10_20: number;
  t_20_30: number;
  t_0_20: number;
};

function fitLine(
  points: { x: number; y: number }[]
): SlowTailFit | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
  return { intercept, slope };
}

function evaluate(fit: SlowTailFit | null, x: number): number | null {
  if (!fit || !Number.isFinite(x) || x <= 0) return null;
  const y = fit.intercept + fit.slope * x;
  return Number.isFinite(y) && y > 0 ? y : null;
}

const rows = segments.rows as SegmentRow[];

const twentyThirtyFit = fitLine(
  rows.map((row) => ({ x: row.t_10_20, y: row.t_20_30 }))
);
const fortyFromTwentyFit = fitLine(
  rows.map((row) => ({ x: row.t_0_20, y: row.predicted_40 }))
);
const fortyFromTenTwentyFit = fitLine(
  rows.map((row) => ({ x: row.t_10_20, y: row.predicted_40 }))
);

export function estimateTwentyThirty(t1020: number): number | null {
  return evaluate(twentyThirtyFit, t1020);
}

export function predict40FromTwenty(t020: number): number | null {
  return evaluate(fortyFromTwentyFit, t020);
}

export function predict40FromTenTwenty(t1020: number): number | null {
  return evaluate(fortyFromTenTwentyFit, t1020);
}
