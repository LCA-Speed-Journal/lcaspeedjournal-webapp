export type LookupPoint = { x: number; y: number };

export type LookupHit = {
  predicted_40: number;
  extrapolated: boolean;
};

export function interpolatePredicted40(
  points: LookupPoint[],
  x: number
): LookupHit | null {
  if (!Number.isFinite(x) || points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) {
    return { predicted_40: sorted[0].y, extrapolated: x < sorted[0].x };
  }
  const last = sorted[sorted.length - 1];
  if (x >= last.x) {
    return { predicted_40: last.y, extrapolated: x > last.x };
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
