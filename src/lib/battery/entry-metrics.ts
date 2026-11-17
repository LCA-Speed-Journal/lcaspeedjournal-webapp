import { LEGACY_SPEED_KEYS } from "@/lib/speed/windows";
import { testingLiftMovement } from "./testing-lifts";
import { BOYS_BASKETBALL_BASELINE } from "./template";

const SPEED_RUN_KEY = "SpeedRun";

export function batteryEntryKeys(input: {
  batterySession: boolean;
  sessionDate: string | null | undefined;
  dayMetrics: readonly string[] | null | undefined;
  registryKeys: readonly string[];
}): string[] {
  const date = input.sessionDate?.slice(0, 10) ?? "";
  const day =
    input.batterySession
      ? BOYS_BASKETBALL_BASELINE.days.find((item) => item.session_date === date)
      : undefined;

  if (day) {
    const registry = new Set(input.registryKeys);
    const keys: string[] = [];
    for (const key of day.metric_keys) {
      if (LEGACY_SPEED_KEYS.has(key)) {
        if (!keys.includes(SPEED_RUN_KEY)) keys.push(SPEED_RUN_KEY);
        continue;
      }
      if (testingLiftMovement(key) || registry.has(key)) keys.push(key);
    }
    return keys;
  }

  if (input.dayMetrics && input.dayMetrics.length > 0) return [...input.dayMetrics];
  return [...input.registryKeys];
}
