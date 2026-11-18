export const COUNTED_SLOT_COUNT = 13;

const SPEED_KEYS = ["20yd_Dash", "40yd_Dash", "MaxVelocity"] as const;

const OTHER_SLOTS = [
  "10-5_RSI",
  "DRI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
] as const;

const STRENGTH_KEYS = ["Bench-Press", "Hex-Deadlift"] as const;

export function batteryTotal(pointsByKey: Record<string, number>): {
  sprint_points: number;
  total_points: number;
  slots_completed: number;
} {
  let sprint_points = 0;
  let sprintCount = 0;
  for (const key of SPEED_KEYS) {
    const points = pointsByKey[key];
    if (points == null) continue;
    sprint_points += points;
    sprintCount += 1;
  }
  let other = 0;
  let otherCount = 0;
  for (const key of OTHER_SLOTS) {
    const points = pointsByKey[key];
    if (points == null) continue;
    other += points;
    otherCount += 1;
  }
  for (const key of STRENGTH_KEYS) {
    const points = pointsByKey[key];
    if (points == null) continue;
    other += points;
    otherCount += 1;
  }
  return {
    sprint_points,
    total_points: sprint_points + other,
    slots_completed: sprintCount + otherCount,
  };
}
