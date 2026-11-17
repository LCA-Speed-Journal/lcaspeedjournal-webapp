export const COUNTED_SLOT_COUNT = 10;

const DASH_KEYS = ["20yd_Dash", "40yd_Dash"] as const;

const FULL_SLOTS = [
  "MaxVelocity",
  "10-5_RSI",
  "DRI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
] as const;

export function batteryTotal(pointsByKey: Record<string, number>): {
  sprint_points: number;
  total_points: number;
  slots_completed: number;
} {
  const dash = DASH_KEYS.flatMap((key) => {
    const points = pointsByKey[key];
    return points == null ? [] : [points];
  });
  const sprint_points =
    dash.length === 0 ? 0 : dash.reduce((sum, points) => sum + points, 0) / dash.length;
  let full = 0;
  let fullCount = 0;
  for (const key of FULL_SLOTS) {
    const points = pointsByKey[key];
    if (points == null) continue;
    full += points;
    fullCount += 1;
  }
  return {
    sprint_points,
    total_points: sprint_points + full,
    slots_completed: fullCount + (dash.length > 0 ? 1 : 0),
  };
}
