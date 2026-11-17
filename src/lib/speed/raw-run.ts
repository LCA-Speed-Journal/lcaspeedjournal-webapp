import {
  ACCELERATION_KEY,
  BUILD_IN_KEY,
  type SpeedRunInput,
} from "./windows";

export type SpeedRunPatchDecision =
  | { kind: "rebuild"; input: SpeedRunInput }
  | { kind: "error"; message: string }
  | { kind: "parseEntry" };

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

/** True when the DB row represents a speed run (stored JSON or Acceleration/BuildIn). */
export function entryIsSpeedRunRow(
  storedRawInput: string | null | undefined,
  metricKey: string
): boolean {
  const storedTrimmed = (storedRawInput ?? "").trim();
  if (storedTrimmed && parseSpeedRunRaw(storedTrimmed)) {
    return true;
  }
  return metricKey === ACCELERATION_KEY || metricKey === BUILD_IN_KEY;
}

export function shouldRebuildSpeedRun(
  storedRawInput: string | null | undefined,
  metricKey: string,
  requestRaw: string
): boolean {
  return decideSpeedRunRawPatch(storedRawInput, metricKey, requestRaw).kind === "rebuild";
}

/** Whether PATCH should rebuild all speed windows, reject, or use parseEntry. */
export function decideSpeedRunRawPatch(
  storedRawInput: string | null | undefined,
  metricKey: string,
  requestRaw: string
): SpeedRunPatchDecision {
  if (!entryIsSpeedRunRow(storedRawInput, metricKey)) {
    return { kind: "parseEntry" };
  }

  const requestInput = parseSpeedRunRaw(requestRaw);
  if (!requestInput) {
    return {
      kind: "error",
      message: "Speed run raw input must be the saved JSON",
    };
  }

  const storedTrimmed = (storedRawInput ?? "").trim();
  if (!storedTrimmed) {
    return {
      kind: "error",
      message:
        "Cannot rebuild speed run: this entry has no saved speed-run JSON on file",
    };
  }

  return { kind: "rebuild", input: requestInput };
}