import { getMetricsRegistry } from "@/lib/parser";
import { isPrimaryResultComponent } from "@/lib/metric-utils";
import { getMaxVelocityKey, getVelocityMetricKeys } from "@/lib/velocity-metrics";
import {
  displayedTestKeys,
  groupExtraTests,
  testSourceFor,
  CORE_TEST_KEYS,
} from "./headlines";
import {
  firstLastEligible,
  improvedPct,
  median,
  metricDelta,
  percentChange,
  summarize,
  type SeriesPoint,
} from "./stats";

export type TestEntryRow = {
  athlete_id: string;
  session_date: string;
  metric_key: string;
  component: string | null;
  display_value: number;
  units: string | null;
};

export type TestSeriesResult = {
  metric_key: string;
  source: "core" | "group_extra" | "added";
  lower_is_better: boolean;
  units: string;
  points: SeriesPoint[];
  first: SeriesPoint | null;
  last: SeriesPoint | null;
  delta: number | null;
  improved_pct: number | null;
};

function lowerIsBetterFor(metricKey: string, units: string | null): boolean {
  if (metricKey === getMaxVelocityKey()) return false;
  if ((units ?? "").toLowerCase() === "s") return true;
  const reg = getMetricsRegistry()[metricKey];
  return (reg?.display_units ?? "").toLowerCase() === "s";
}

function matchesMetric(
  row: TestEntryRow,
  metricKey: string,
  velocityKeys: Set<string>
): boolean {
  if (metricKey === getMaxVelocityKey()) {
    return velocityKeys.has(row.metric_key);
  }
  if (row.metric_key !== metricKey) return false;
  return isPrimaryResultComponent(metricKey, row.component);
}

function bestPerAthleteSession(
  rows: TestEntryRow[],
  metricKey: string,
  lowerIsBetter: boolean,
  velocityKeys: Set<string>
): Map<string, number> {
  const best = new Map<string, number>();
  for (const row of rows) {
    if (!matchesMetric(row, metricKey, velocityKeys)) continue;
    if (!Number.isFinite(row.display_value)) continue;
    const key = `${row.session_date}\0${row.athlete_id}`;
    const prev = best.get(key);
    if (prev == null) {
      best.set(key, row.display_value);
      continue;
    }
    if (lowerIsBetter ? row.display_value < prev : row.display_value > prev) {
      best.set(key, row.display_value);
    }
  }
  return best;
}

export function aggregateTestSeries(opts: {
  rows: TestEntryRow[];
  metricKeys: string[];
  hugoGroup: string;
  addedMetrics: readonly string[];
  minN?: number;
}): TestSeriesResult[] {
  const minN = opts.minN ?? 3;
  const velocityKeys = new Set(getVelocityMetricKeys());
  const out: TestSeriesResult[] = [];

  for (const metricKey of opts.metricKeys) {
    const sample = opts.rows.find((r) =>
      matchesMetric(r, metricKey, velocityKeys)
    );
    const units =
      metricKey === getMaxVelocityKey()
        ? "mph"
        : (sample?.units ??
          getMetricsRegistry()[metricKey]?.display_units ??
          "");
    const lowerIsBetter = lowerIsBetterFor(metricKey, units);
    const best = bestPerAthleteSession(
      opts.rows,
      metricKey,
      lowerIsBetter,
      velocityKeys
    );

    const athleteBaseline = new Map<string, { date: string; value: number }>();
    for (const [key, value] of best) {
      const [date, athleteId] = key.split("\0");
      if (!date || !athleteId) continue;
      const prev = athleteBaseline.get(athleteId);
      if (prev == null || date < prev.date) {
        athleteBaseline.set(athleteId, { date, value });
      }
    }

    const byDate = new Map<string, { raw: number[]; change: number[] }>();
    for (const [key, value] of best) {
      const [date, athleteId] = key.split("\0");
      if (!date || !athleteId) continue;
      const bucket = byDate.get(date) ?? { raw: [], change: [] };
      bucket.raw.push(value);
      const baseline = athleteBaseline.get(athleteId);
      if (baseline && date === baseline.date) {
        bucket.change.push(0);
      } else if (baseline) {
        const pct = percentChange(value, baseline.value);
        if (pct != null) bucket.change.push(pct);
      }
      byDate.set(date, bucket);
    }

    const dates = [...byDate.keys()].sort();
    const points: SeriesPoint[] = [];
    for (const date of dates) {
      const { raw, change } = byDate.get(date)!;
      const med = median(raw);
      if (med == null) continue;
      const point: SeriesPoint = {
        date,
        median: med,
        n: raw.length,
      };
      const changeMed = median(change);
      if (changeMed != null) point.median_change_pct = changeMed;
      const output = summarize(raw);
      if (output) point.output = output;
      const changeBox = summarize(change);
      if (changeBox) point.change = changeBox;
      points.push(point);
    }

    const fl = firstLastEligible(points, minN);
    const pairs = athleteTestDeltas(opts.rows, metricKey, lowerIsBetter);
    const pairList = [...pairs.values()].map((p) => ({
      first: p.first,
      last: p.last,
    }));

    out.push({
      metric_key: metricKey,
      source: testSourceFor(metricKey, opts.hugoGroup, opts.addedMetrics),
      lower_is_better: lowerIsBetter,
      units,
      points,
      first: fl?.first ?? null,
      last: fl?.last ?? null,
      delta: metricDelta(fl?.first.median, fl?.last.median, lowerIsBetter),
      improved_pct: improvedPct(pairList, lowerIsBetter),
    });
  }

  return out;
}

export type AthleteMetricDelta = {
  first: number;
  last: number;
  delta: number;
};

export function athleteTestDeltas(
  rows: TestEntryRow[],
  metricKey: string,
  lowerIsBetter: boolean
): Map<string, AthleteMetricDelta> {
  const velocityKeys = new Set(getVelocityMetricKeys());
  const byAthlete = new Map<string, { date: string; value: number }[]>();

  for (const row of rows) {
    if (!matchesMetric(row, metricKey, velocityKeys)) continue;
    if (!Number.isFinite(row.display_value)) continue;
    const list = byAthlete.get(row.athlete_id) ?? [];
    list.push({ date: row.session_date, value: row.display_value });
    byAthlete.set(row.athlete_id, list);
  }

  const out = new Map<string, AthleteMetricDelta>();
  for (const [athleteId, marks] of byAthlete) {
    // Best per date, then first/last date
    const byDate = new Map<string, number>();
    for (const m of marks) {
      const prev = byDate.get(m.date);
      if (
        prev == null ||
        (lowerIsBetter ? m.value < prev : m.value > prev)
      ) {
        byDate.set(m.date, m.value);
      }
    }
    const dates = [...byDate.keys()].sort();
    if (dates.length < 2) continue;
    const first = byDate.get(dates[0]!)!;
    const last = byDate.get(dates[dates.length - 1]!)!;
    out.set(athleteId, {
      first,
      last,
      delta: last - first,
    });
  }
  return out;
}

export function listAvailableExtraMetrics(
  rows: TestEntryRow[],
  hugoGroup: string,
  addedMetrics: readonly string[]
): string[] {
  const displayed = new Set(displayedTestKeys(hugoGroup, addedMetrics));
  // Also exclude core+group even if not in displayed for safety
  for (const k of CORE_TEST_KEYS) displayed.add(k);
  for (const k of groupExtraTests(hugoGroup)) displayed.add(k);

  const velocityKeys = new Set(getVelocityMetricKeys());
  const seen = new Set<string>();
  for (const row of rows) {
    let key = row.metric_key;
    if (velocityKeys.has(row.metric_key)) {
      // MaxVelocity is core — don't list raw mph keys as extras unless not already covered
    }
    if (displayed.has(key)) continue;
    if (!isPrimaryResultComponent(key, row.component) && key !== getMaxVelocityKey()) {
      // still allow non-primary metrics as available? Prefer primary-only for add list
      if (getMetricsRegistry()[key]?.input_structure === "cumulative") continue;
      if (key === "40yd_Dash" || key === "20yd_Dash" || key === "5-10-5_Agility") {
        continue;
      }
    }
    seen.add(key);
  }
  return [...seen].sort();
}
