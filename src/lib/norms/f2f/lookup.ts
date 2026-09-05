export type LookupPoint = { x: number; y: number };

export type LookupHit = {
  predicted_40: number;
  extrapolated: boolean;
};

export type SlowTailFit = {
  intercept: number;
  slope: number;
};

export function slowTailCount(n: number): number {
  if (n < 2) return n;
  if (n < 3) return 2;
  return Math.max(3, Math.ceil(n / 3));
}

export function fitSlowTail(points: LookupPoint[]): SlowTailFit | null {
  if (points.length < 2) return null;
  const tail = [...points]
    .toSorted((a, b) => b.y - a.y)
    .slice(0, slowTailCount(points.length));
  const n = tail.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of tail) {
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

function evaluateFit(fit: SlowTailFit, x: number): number | null {
  const y = fit.intercept + fit.slope * x;
  return Number.isFinite(y) ? y : null;
}

function extrapolateSlow(
  fit: SlowTailFit | null,
  x: number,
  edge: LookupPoint,
  slopeOk: boolean
): LookupHit {
  if (slopeOk && fit) {
    const y = evaluateFit(fit, x);
    // A slower mark must not predict a faster 40 than the published edge.
    if (y != null && y > edge.y) return { predicted_40: y, extrapolated: true };
  }
  return { predicted_40: edge.y, extrapolated: true };
}

export function interpolatePredicted40(
  points: LookupPoint[],
  x: number,
  fit?: SlowTailFit | null
): LookupHit | null {
  if (!Number.isFinite(x) || points.length === 0) return null;
  const sorted = [...points].toSorted((a, b) => a.x - b.x);
  const lo = sorted[0];
  const last = sorted[sorted.length - 1];
  const resolvedFit = fit === undefined ? fitSlowTail(points) : fit;
  const slowIsLowX = lo.y >= last.y;
  // Interior point slower than the edge means the tail already reversed.
  const maxY = sorted.reduce((m, p) => (p.y > m ? p.y : m), lo.y);
  const slowEdgeIsSlowest = (slowIsLowX ? lo.y : last.y) >= maxY;

  if (x < lo.x) {
    return extrapolateSlow(
      resolvedFit,
      x,
      lo,
      Boolean(slowIsLowX && slowEdgeIsSlowest && resolvedFit && resolvedFit.slope < 0)
    );
  }
  if (x > last.x) {
    return extrapolateSlow(
      resolvedFit,
      x,
      last,
      Boolean(!slowIsLowX && slowEdgeIsSlowest && resolvedFit && resolvedFit.slope > 0)
    );
  }
  if (x <= lo.x) {
    return { predicted_40: lo.y, extrapolated: false };
  }
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return {
        predicted_40: a.y + t * (b.y - a.y),
        extrapolated: false,
      };
    }
  }
  return { predicted_40: last.y, extrapolated: true };
}
