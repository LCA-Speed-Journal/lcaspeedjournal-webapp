import { classifyLiftName, LIFT_PATTERNS, type LiftId } from "./headlines";
import {
  firstLastEligible,
  median,
  metricDelta,
  type SeriesPoint,
} from "./stats";

export type LiftLogRow = {
  athlete_id: string;
  session_date: string;
  movement_name: string;
  kind: string | null;
  load: number | null;
};

export type LiftSeriesResult = {
  lift_id: LiftId;
  label: string;
  points: SeriesPoint[];
  first: SeriesPoint | null;
  last: SeriesPoint | null;
  delta: number | null;
};

/**
 * Prefer the movement name with the most athlete-days within a lift pattern
 * for the chart title (e.g. Bench vs Overhead Press).
 */
function preferredLabel(
  liftId: LiftId,
  nameCounts: Map<string, number>
): string {
  const fallback = LIFT_PATTERNS.find((p) => p.id === liftId)?.label ?? liftId;
  let bestName: string | null = null;
  let bestCount = 0;
  for (const [name, count] of nameCounts) {
    if (classifyLiftName(name) !== liftId) continue;
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }
  return bestName ?? fallback;
}

export function aggregateLiftSeries(
  rows: LiftLogRow[],
  minN = 3
): LiftSeriesResult[] {
  type Key = string; // liftId\0date\0athlete
  const bestLoad = new Map<Key, number>();
  const nameCounts = new Map<string, number>();
  const seenAthleteDayName = new Set<string>();

  for (const row of rows) {
    if (row.kind !== "load_reps") continue;
    if (row.load == null || !Number.isFinite(row.load)) continue;
    const liftId = classifyLiftName(row.movement_name);
    if (!liftId) continue;
    const date = row.session_date;
    const key = `${liftId}\0${date}\0${row.athlete_id}`;
    const prev = bestLoad.get(key);
    if (prev == null || row.load > prev) bestLoad.set(key, row.load);

    const nameKey = `${date}\0${row.athlete_id}\0${row.movement_name}`;
    if (!seenAthleteDayName.has(nameKey)) {
      seenAthleteDayName.add(nameKey);
      nameCounts.set(
        row.movement_name,
        (nameCounts.get(row.movement_name) ?? 0) + 1
      );
    }
  }

  const byLiftDate = new Map<string, number[]>();
  for (const [key, load] of bestLoad) {
    const [liftId, date] = key.split("\0");
    const dk = `${liftId}\0${date}`;
    const list = byLiftDate.get(dk) ?? [];
    list.push(load);
    byLiftDate.set(dk, list);
  }

  const out: LiftSeriesResult[] = [];
  for (const pattern of LIFT_PATTERNS) {
    const dateKeys = [...byLiftDate.keys()]
      .filter((k) => k.startsWith(`${pattern.id}\0`))
      .sort();
    const points: SeriesPoint[] = [];
    for (const dk of dateKeys) {
      const date = dk.split("\0")[1]!;
      const values = byLiftDate.get(dk)!;
      const med = median(values);
      if (med == null) continue;
      points.push({ date, median: med, n: values.length });
    }
    if (points.length === 0) continue;
    const fl = firstLastEligible(points, Math.min(minN, 1));
    const flStrict = firstLastEligible(points, minN) ?? fl;
    out.push({
      lift_id: pattern.id,
      label: preferredLabel(pattern.id, nameCounts),
      points,
      first: flStrict?.first ?? null,
      last: flStrict?.last ?? null,
      delta: metricDelta(
        flStrict?.first.median,
        flStrict?.last.median,
        false
      ),
    });
  }
  return out;
}

export function athleteLiftDeltas(
  rows: LiftLogRow[],
  liftId: LiftId
): Map<string, { first: number; last: number; delta: number }> {
  const byAthlete = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.kind !== "load_reps" || row.load == null) continue;
    if (classifyLiftName(row.movement_name) !== liftId) continue;
    const date = row.session_date;
    const days = byAthlete.get(row.athlete_id) ?? new Map();
    const prev = days.get(date);
    if (prev == null || row.load > prev) days.set(date, row.load);
    byAthlete.set(row.athlete_id, days);
  }
  const out = new Map<string, { first: number; last: number; delta: number }>();
  for (const [id, days] of byAthlete) {
    const keys = [...days.keys()].sort();
    if (keys.length < 2) continue;
    const first = days.get(keys[0]!)!;
    const last = days.get(keys[keys.length - 1]!)!;
    out.set(id, { first, last, delta: last - first });
  }
  return out;
}
