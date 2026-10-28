export const DROPOFF_PERCENT = 6;

export type DropoffDirection = "time" | "score";

export type DropoffSummary = {
  initial: number;
  dropoffLine: number;
  dropoffPercent: number;
  attemptsAboveLine: number;
  crossedDropoff: boolean;
};

export function directionFromUnits(units: string): DropoffDirection {
  return units.trim().toLowerCase() === "s" ? "time" : "score";
}

function round2(n: number): number {
  return Math.round(Number((n * 100).toPrecision(12))) / 100;
}

export function dropoffLine(
  initial: number,
  direction: DropoffDirection,
  percent = DROPOFF_PERCENT
): number {
  const factor = percent / 100;
  const raw = direction === "time" ? initial * (1 + factor) : initial * (1 - factor);
  return round2(raw);
}

function isBetter(value: number, initial: number, direction: DropoffDirection): boolean {
  return direction === "time" ? value < initial : value > initial;
}

function onGoodSide(value: number, line: number, direction: DropoffDirection): boolean {
  return direction === "time" ? value <= line : value >= line;
}

export function summarizeDropoff(
  attempts: number[],
  direction: DropoffDirection,
  percent = DROPOFF_PERCENT
): DropoffSummary | null {
  const values = attempts.filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return null;

  let initial = values[0];
  let line = dropoffLine(initial, direction, percent);
  let crossedDropoff = false;

  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    if (isBetter(value, initial, direction)) {
      initial = value;
      line = dropoffLine(initial, direction, percent);
      continue;
    }
    if (!onGoodSide(value, line, direction)) crossedDropoff = true;
  }

  let attemptsAboveLine = 0;
  for (const value of values) {
    if (onGoodSide(value, line, direction)) attemptsAboveLine += 1;
  }

  return {
    initial,
    dropoffLine: line,
    dropoffPercent: percent,
    attemptsAboveLine,
    crossedDropoff,
  };
}
