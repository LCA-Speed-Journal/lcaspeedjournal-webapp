import { classifyLiftName, LIFT_PATTERNS, type LiftId } from "./headlines";
import {
  firstLastEligible,
  isoWeekStart,
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
 * Prefer the movement name with the most athlete-weeks within a lift pattern
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
  type Key = string; // liftId\0week\0athlete
  const bestLoad = new Map<Key, number>();
  const nameCounts = new Map<string, number>();
  const seenAthleteWeekName = new Set<string>();

  for (const row of rows) {
    if (row.kind !== "load_reps") continue;
    if (row.load == null || !Number.isFinite(row.load)) continue;
    const liftId = classifyLiftName(row.movement_name);
    if (!liftId) continue;
    const week = isoWeekStart(row.session_date);
    const key = `${liftId}\0${week}\0${row.athlete_id}`;
    const prev = bestLoad.get(key);
    if (prev == null || row.load > prev) bestLoad.set(key, row.load);

    const nameKey = `${week}\0${row.athlete_id}\0${row.movement_name}`;
    if (!seenAthleteWeekName.has(nameKey)) {
      seenAthleteWeekName.add(nameKey);
      nameCounts.set(
        row.movement_name,
        (nameCounts.get(row.movement_name) ?? 0) + 1
      );
    }
  }

  const byLiftWeek = new Map<string, number[]>();
  for (const [key, load] of bestLoad) {
    const [liftId, week] = key.split("\0");
    const wk = `${liftId}\0${week}`;
    const list = byLiftWeek.get(wk) ?? [];
    list.push(load);
    byLiftWeek.set(wk, list);
  }

  const out: LiftSeriesResult[] = [];
  for (const pattern of LIFT_PATTERNS) {
    const weekKeys = [...byLiftWeek.keys()]
      .filter((k) => k.startsWith(`${pattern.id}\0`))
      .sort();
    const points: SeriesPoint[] = [];
    for (const wk of weekKeys) {
      const week = wk.split("\0")[1]!;
      const values = byLiftWeek.get(wk)!;
      const med = median(values);
      if (med == null) continue;
      points.push({ date: week, median: med, n: values.length });
    }
    if (points.length === 0) continue;
    const fl = firstLastEligible(points, Math.min(minN, 1));
    // For lifts use minN only when enough athletes; still show first/last of any points if minN too high for early weeks
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
    const week = isoWeekStart(row.session_date);
    const weeks = byAthlete.get(row.athlete_id) ?? new Map();
    const prev = weeks.get(week);
    if (prev == null || row.load > prev) weeks.set(week, row.load);
    byAthlete.set(row.athlete_id, weeks);
  }
  const out = new Map<string, { first: number; last: number; delta: number }>();
  for (const [id, weeks] of byAthlete) {
    const keys = [...weeks.keys()].sort();
    if (keys.length < 2) continue;
    const first = weeks.get(keys[0]!)!;
    const last = weeks.get(keys[keys.length - 1]!)!;
    out.set(id, { first, last, delta: last - first });
  }
  return out;
}
