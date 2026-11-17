import type { SpeedRunInput } from "./windows";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSpeedRunShape(value: unknown): value is SpeedRunInput {
  if (!isRecord(value)) return false;
  if (value.distanceUnit === undefined) return false;
  if (value.gates === undefined || !Array.isArray(value.gates)) return false;
  if (value.cumulativeTimes === undefined || !Array.isArray(value.cumulativeTimes)) {
    return false;
  }
  return true;
}

/** Returns a speed-run payload when `raw` is JSON with gates and cumulative times; otherwise null. */
export function parseSpeedRunRaw(raw: string): SpeedRunInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isSpeedRunShape(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}