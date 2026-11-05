export const SHARED_SOCCER_KEYS = new Set([
  "Standing-Broad",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "OH-MB_Throw",
]);

const LOWER_BETTER = new Set(["20yd_Dash", "40yd_Dash"]);

export type MarkDelta = {
  previous: number;
  current: number;
  change: number;
  improved: boolean;
};

export function compareMark(
  metricKey: string,
  current: number | null,
  previous: number | null
): MarkDelta | null {
  if (!SHARED_SOCCER_KEYS.has(metricKey)) return null;
  if (current == null || previous == null) return null;
  const change = current - previous;
  const improved = LOWER_BETTER.has(metricKey) ? change < 0 : change > 0;
  return { previous, current, change, improved };
}
