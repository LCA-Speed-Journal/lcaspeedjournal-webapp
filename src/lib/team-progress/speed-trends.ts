import { reconstructFiveFifteen } from "@/lib/norms/f2f/reconstruct-515";
import {
  spanningBuildInKeys,
  windowIdentity,
  type SpeedWindowRow,
} from "@/lib/speed/adjacent";
import { ACCELERATION_KEY, BUILD_IN_KEY } from "@/lib/speed/windows";
import {
  median,
  percentChange,
  summarize,
  type SeriesPoint,
} from "./stats";

export type SpeedTrendRow = SpeedWindowRow & {
  id?: string;
  athlete_id: string;
  session_date: string;
  value: number;
  display_value: number;
  units: string | null;
};

export type SpeedTrendSeries = {
  component: string;
  points: SeriesPoint[];
};

const FIVE_FIFTEEN = "5-15yd";
const FIVE_FIFTEEN_METERS = "5-15m";
const FIVE_TEN = "5-10yd";
const TEN_TWENTY = "10-20yd";

function isFiveFifteenComponent(component: string): boolean {
  return component === FIVE_FIFTEEN || component === FIVE_FIFTEEN_METERS;
}

function pointsFromBuckets(
  byDate: Map<string, { raw: number[]; change: number[] }>
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const bucket = byDate.get(date);
    if (!bucket || bucket.raw.length === 0) continue;
    const med = median(bucket.raw);
    if (med == null) continue;
    const point: SeriesPoint = {
      date,
      median: med,
      n: bucket.raw.length,
    };
    const changeMed = median(bucket.change);
    if (changeMed != null) point.median_change_pct = changeMed;
    const output = summarize(bucket.raw);
    if (output) point.output = output;
    const changeBox = summarize(bucket.change);
    if (changeBox) point.change = changeBox;
    points.push(point);
  }
  return points;
}

function pushMark(
  byDate: Map<string, { raw: number[]; change: number[] }>,
  date: string,
  mph: number,
  baselineMph: number,
  isBaseline: boolean
) {
  const bucket = byDate.get(date) ?? { raw: [], change: [] };
  bucket.raw.push(mph);
  if (isBaseline) {
    bucket.change.push(0);
  } else {
    const pct = percentChange(mph, baselineMph);
    if (pct != null) bucket.change.push(pct);
  }
  byDate.set(date, bucket);
}

/** Best mph per athlete per day. Higher mph wins. */
function bestByAthleteDate(rows: SpeedTrendRow[]): Map<string, Map<string, number>> {
  const byAthlete = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!Number.isFinite(row.display_value)) continue;
    const dates = byAthlete.get(row.athlete_id) ?? new Map<string, number>();
    const prev = dates.get(row.session_date);
    if (prev == null || row.display_value > prev) {
      dates.set(row.session_date, row.display_value);
    }
    byAthlete.set(row.athlete_id, dates);
  }
  return byAthlete;
}

function seriesFromBestMph(
  component: string,
  rows: SpeedTrendRow[]
): SpeedTrendSeries | null {
  const byAthlete = bestByAthleteDate(rows);
  const byDate = new Map<string, { raw: number[]; change: number[] }>();

  for (const dates of byAthlete.values()) {
    const sorted = [...dates.keys()].sort();
    const baselineDate = sorted[0];
    if (!baselineDate) continue;
    const baselineMph = dates.get(baselineDate);
    if (baselineMph == null) continue;
    for (const date of sorted) {
      const mph = dates.get(date);
      if (mph == null) continue;
      pushMark(byDate, date, mph, baselineMph, date === baselineDate);
    }
  }

  const points = pointsFromBuckets(byDate);
  if (points.length < 2) return null;
  return { component, points };
}

type SplitSession = {
  session_id: string;
  session_date: string;
  fives: SpeedTrendRow[];
  tens: SpeedTrendRow[];
};

function compareEntryId(a: SpeedTrendRow, b: SpeedTrendRow): number {
  const ai = a.id ?? "";
  const bi = b.id ?? "";
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}

/** Same-index reps only. The first pair reconstructFiveFifteen accepts wins. */
function pairedBaselineMph(session: SplitSession): number | null {
  const fives = [...session.fives].sort(compareEntryId);
  const tens = [...session.tens].sort(compareEntryId);
  const n = Math.min(fives.length, tens.length);
  for (let i = 0; i < n; i++) {
    const hit = reconstructFiveFifteen(fives[i]!.value, tens[i]!.value);
    if (hit) return hit.mph;
  }
  return null;
}

function splitSessions(rows: SpeedTrendRow[]): Map<string, SplitSession[]> {
  const byAthlete = new Map<string, Map<string, SplitSession>>();
  for (const row of rows) {
    if (row.metric_key !== BUILD_IN_KEY) continue;
    if (row.component !== FIVE_TEN && row.component !== TEN_TWENTY) continue;
    const sessions = byAthlete.get(row.athlete_id) ?? new Map<string, SplitSession>();
    const existing = sessions.get(row.session_id) ?? {
      session_id: row.session_id,
      session_date: row.session_date,
      fives: [],
      tens: [],
    };
    if (row.component === FIVE_TEN) existing.fives.push(row);
    else existing.tens.push(row);
    sessions.set(row.session_id, existing);
    byAthlete.set(row.athlete_id, sessions);
  }

  const out = new Map<string, SplitSession[]>();
  for (const [athleteId, sessions] of byAthlete) {
    out.set(
      athleteId,
      [...sessions.values()].sort((a, b) => {
        if (a.session_date !== b.session_date) {
          return a.session_date < b.session_date ? -1 : 1;
        }
        return a.session_id < b.session_id ? -1 : 1;
      })
    );
  }
  return out;
}

function fiveFifteenBaseline(
  sessions: SplitSession[] | undefined,
  timed: Map<string, number> | undefined
): { date: string; mph: number } | null {
  const pair = sessions?.find(
    (session) => session.fives.length > 0 && session.tens.length > 0
  );
  if (pair) {
    const mph = pairedBaselineMph(pair);
    if (mph != null) return { date: pair.session_date, mph };
  }

  const dates = timed ? [...timed.keys()].sort() : [];
  const first = dates[0];
  if (!first || !timed) return null;
  const mph = timed.get(first);
  if (mph == null) return null;
  return { date: first, mph };
}

function seriesForFiveFifteen(
  splitRows: SpeedTrendRow[],
  timedRows: SpeedTrendRow[],
  component: string
): SpeedTrendSeries | null {
  const sessions = splitSessions(splitRows);
  const timed = bestByAthleteDate(timedRows);
  const athleteIds = new Set<string>([...sessions.keys(), ...timed.keys()]);
  const byDate = new Map<string, { raw: number[]; change: number[] }>();

  for (const athleteId of athleteIds) {
    const marks = timed.get(athleteId);
    const baseline = fiveFifteenBaseline(sessions.get(athleteId), marks);
    if (!baseline) continue;
    const laterDates = [...(marks?.keys() ?? [])]
      .filter((date) => date > baseline.date)
      .sort();
    if (laterDates.length === 0) continue;

    pushMark(byDate, baseline.date, baseline.mph, baseline.mph, true);
    for (const date of laterDates) {
      const mph = marks?.get(date);
      if (mph == null) continue;
      pushMark(byDate, date, mph, baseline.mph, false);
    }
  }

  const points = pointsFromBuckets(byDate);
  if (points.length < 2) return null;
  return { component, points };
}

export function aggregateSpeedTrends(rows: SpeedTrendRow[]): SpeedTrendSeries[] {
  const windowRows = rows.filter(
    (row) =>
      (row.metric_key === ACCELERATION_KEY || row.metric_key === BUILD_IN_KEY) &&
      (row.distance_unit === "yd" || row.distance_unit === "m") &&
      Number.isFinite(row.start_distance) &&
      Number.isFinite(row.end_distance)
  );
  const spanning = spanningBuildInKeys(windowRows);
  const chartRows = windowRows.filter(
    (row) =>
      row.metric_key === BUILD_IN_KEY &&
      !isFiveFifteenComponent(row.component) &&
      !spanning.has(windowIdentity(row))
  );

  const byComponent = new Map<string, SpeedTrendRow[]>();
  for (const row of chartRows) {
    const list = byComponent.get(row.component) ?? [];
    list.push(row);
    byComponent.set(row.component, list);
  }

  const series: SpeedTrendSeries[] = [];
  for (const [component, componentRows] of byComponent) {
    const built = seriesFromBestMph(component, componentRows);
    if (built) series.push(built);
  }

  const splitRows = windowRows.filter((row) => row.metric_key === BUILD_IN_KEY);
  const timedFive = new Map<string, SpeedTrendRow[]>();
  for (const row of splitRows) {
    if (!isFiveFifteenComponent(row.component)) continue;
    const list = timedFive.get(row.component) ?? [];
    list.push(row);
    timedFive.set(row.component, list);
  }
  for (const [component, timedRows] of timedFive) {
    const five = seriesForFiveFifteen(
      component === FIVE_FIFTEEN ? splitRows : [],
      timedRows,
      component
    );
    if (five) series.push(five);
  }

  series.sort((a, b) => a.component.localeCompare(b.component));
  return series;
}
