import type { BoardRow } from "./board-order";
import type { BoardAthlete } from "./load";

const STRENGTH_LIFT_KEYS = ["Bench-Press", "Hex-Deadlift"] as const;

export function isStrengthPoundDay(columnKeys: readonly string[]): boolean {
  return columnKeys.length > 0 && columnKeys.every((key) =>
    STRENGTH_LIFT_KEYS.includes(key as (typeof STRENGTH_LIFT_KEYS)[number])
  );
}

export function strengthPounds(athlete: BoardAthlete): number | null {
  let sum = 0;
  let count = 0;
  for (const key of STRENGTH_LIFT_KEYS) {
    const value = athlete.cells[key]?.value;
    if (value == null || !Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? null : sum;
}

export function formatStrengthPounds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function orderByStrengthPounds(
  athletes: BoardAthlete[],
  untestedIds: readonly string[]
): BoardRow[] {
  const untested = new Set(untestedIds);
  const ranked = athletes.filter(
    (athlete) => !untested.has(athlete.athlete_id) && strengthPounds(athlete) != null
  );
  const waiting = athletes.filter(
    (athlete) => untested.has(athlete.athlete_id) || strengthPounds(athlete) == null
  );
  ranked.sort((a, b) => {
    const byPounds = (strengthPounds(b) ?? 0) - (strengthPounds(a) ?? 0);
    if (byPounds !== 0) return byPounds;
    const byLast = a.last_name.localeCompare(b.last_name);
    if (byLast !== 0) return byLast;
    const byFirst = a.first_name.localeCompare(b.first_name);
    if (byFirst !== 0) return byFirst;
    return a.athlete_id.localeCompare(b.athlete_id);
  });
  let place = 0;
  let previous: number | null = null;
  const testedRows = ranked.map((athlete, index) => {
    const pounds = strengthPounds(athlete);
    if (pounds !== previous) {
      place = index + 1;
      previous = pounds;
    }
    return { athlete, place, untested: false as const };
  });
  return [
    ...testedRows,
    ...waiting.map((athlete) => ({ athlete, place: null, untested: true as const })),
  ];
}
