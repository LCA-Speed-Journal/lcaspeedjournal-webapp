import { scoreAthleteTotals } from "@/lib/norms/testing-day-rank";

export const COUNTED_SLOT_COUNT = 9;

const SPRINT_KEYS = ["20yd_Dash", "40yd_Dash", "MaxVelocity"] as const;

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

export function batteryTotal(pointsByKey: Record<string, number>): {
  sprint_points: number;
  total_points: number;
  slots_completed: number;
} {
  const totals = scoreAthleteTotals(pointsByKey);
  const sprintPresent = SPRINT_KEYS.some((key) => pointsByKey[key] != null);
  const otherPresent = OTHER_SLOTS.filter((key) => pointsByKey[key] != null).length;
  return {
    sprint_points: totals.sprint_points,
    total_points: totals.total_points,
    slots_completed: otherPresent + (sprintPresent ? 1 : 0),
  };
}
