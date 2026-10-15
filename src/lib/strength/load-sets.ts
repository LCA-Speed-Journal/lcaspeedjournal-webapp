import { sql } from "@/lib/db";
import { median } from "@/lib/team-progress/stats";
import {
  normalizeTargets,
  serializeDate,
} from "@/lib/weight-room/insert-template";
import type { HugoGroup } from "@/lib/weight-room/constants";
import {
  buildPatternSeries,
  type LoggedStrengthSet,
  type PatternPoint,
} from "./series";
import type { StrengthPattern } from "./exercises";

export type StrengthSeriesPointJson = {
  date: string;
  reference_e1rm: number;
  source_movement: string;
  load: number;
  reps: number;
  rpe: number;
};

export type StrengthSeriesPatternJson = {
  pattern: StrengthPattern;
  reference_name: string;
  points: StrengthSeriesPointJson[];
};

export type StrengthSeriesAthleteJson = {
  athlete_id: string;
  patterns: StrengthSeriesPatternJson[];
};

export type StrengthSeriesMedianJson = {
  pattern: StrengthPattern;
  points: Array<{ date: string; reference_e1rm: number }>;
};

export type StrengthSeriesData = {
  athletes: StrengthSeriesAthleteJson[];
  median?: StrengthSeriesMedianJson[];
};

export type StrengthSeriesQuery =
  | { athleteId: string }
  | { hugoGroup: HugoGroup; from: string; to: string };

type CarryPoint = {
  athleteId: string;
  date: string;
  referenceE1rm: number;
};

/**
 * Median reference on each date that someone actually logged.
 * Each athlete contributes their own last point on or before that date,
 * and only inside this pattern. A missing week keeps their previous value.
 */
export function carryForwardMedian(
  series: ReadonlyArray<{
    pattern: StrengthPattern;
    points: readonly CarryPoint[];
  }>
): Array<{
  pattern: StrengthPattern;
  points: Array<{ date: string; referenceE1rm: number }>;
}> {
  return series.map((pattern) => {
    const lines = linesByAthlete(pattern.points);
    const dates = [...new Set(pattern.points.map((point) => point.date))].sort();
    const points: Array<{ date: string; referenceE1rm: number }> = [];

    for (const date of dates) {
      const values: number[] = [];
      for (const line of lines.values()) {
        const value = valueOnOrBefore(line, date);
        if (value != null) values.push(value);
      }
      const value = median(values);
      if (value != null) points.push({ date, referenceE1rm: value });
    }

    return { pattern: pattern.pattern, points };
  });
}

function linesByAthlete(points: readonly CarryPoint[]): Map<string, CarryLine> {
  const byAthlete = new Map<string, Map<string, number>>();
  for (const point of points) {
    let byDate = byAthlete.get(point.athleteId);
    if (!byDate) {
      byDate = new Map();
      byAthlete.set(point.athleteId, byDate);
    }
    const current = byDate.get(point.date);
    if (current == null || point.referenceE1rm > current) {
      byDate.set(point.date, point.referenceE1rm);
    }
  }

  const lines = new Map<string, CarryLine>();
  for (const [athleteId, byDate] of byAthlete) {
    const dates = [...byDate.keys()].sort();
    lines.set(athleteId, {
      dates,
      values: dates.map((date) => byDate.get(date)!),
    });
  }
  return lines;
}

type CarryLine = { dates: string[]; values: number[] };

function valueOnOrBefore(line: CarryLine, date: string): number | null {
  let value: number | null = null;
  for (let i = 0; i < line.dates.length; i++) {
    const pointDate = line.dates[i]!;
    if (pointDate > date) break;
    value = line.values[i]!;
  }
  return value;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowsToLoggedSets(rows: Record<string, unknown>[]): LoggedStrengthSet[] {
  return rows.map((row) => {
    const targets = normalizeTargets(row.targets);
    const setIndex = toNum(row.set_index);
    const target =
      setIndex != null &&
      Number.isInteger(setIndex) &&
      setIndex >= 0 &&
      setIndex < targets.length
        ? targets[setIndex]!
        : null;
    return {
      athleteId: String(row.athlete_id),
      date: serializeDate(row.session_date),
      movementName: String(row.movement_name ?? ""),
      load: toNum(row.load),
      reps: toNum(row.reps),
      target,
      rpeOverride: toNum(row.rpe_override),
    };
  });
}

async function loadAthleteSets(athleteId: string): Promise<LoggedStrengthSet[]> {
  const { rows } = await sql`
    SELECT
      l.athlete_id::text AS athlete_id,
      l.session_date,
      m.name AS movement_name,
      m.targets,
      r.set_index,
      r.load,
      r.reps,
      r.rpe_override
    FROM session_logs l
    INNER JOIN set_results r ON r.session_log_id = l.id
    INNER JOIN workout_movements m ON m.id = r.movement_id
    WHERE r.kind = ${"load_reps"}
      AND l.athlete_id = ${athleteId}::uuid
    ORDER BY l.session_date, r.set_index
  `;
  return rowsToLoggedSets(rows as Record<string, unknown>[]);
}

async function loadGroupSets(opts: {
  hugoGroup: HugoGroup;
  from: string;
  to: string;
}): Promise<LoggedStrengthSet[]> {
  const { rows } = await sql`
    SELECT
      l.athlete_id::text AS athlete_id,
      l.session_date,
      m.name AS movement_name,
      m.targets,
      r.set_index,
      r.load,
      r.reps,
      r.rpe_override
    FROM session_logs l
    INNER JOIN set_results r ON r.session_log_id = l.id
    INNER JOIN workout_movements m ON m.id = r.movement_id
    INNER JOIN athlete_hugo_memberships mem ON mem.athlete_id = l.athlete_id
    INNER JOIN athletes a ON a.id = l.athlete_id
    WHERE r.kind = ${"load_reps"}
      AND mem.hugo_group = ${opts.hugoGroup}
      AND l.hugo_group = ${opts.hugoGroup}
      AND a.active = true
      AND l.session_date >= ${opts.from}::date
      AND l.session_date <= ${opts.to}::date
    ORDER BY l.session_date, r.set_index
  `;
  return rowsToLoggedSets(rows as Record<string, unknown>[]);
}

async function loadRosterAthleteIds(hugoGroup: HugoGroup): Promise<string[]> {
  const { rows } = await sql`
    SELECT m.athlete_id::text AS athlete_id
    FROM athlete_hugo_memberships m
    JOIN athletes a ON a.id = m.athlete_id
    WHERE m.hugo_group = ${hugoGroup} AND a.active = true
    ORDER BY m.athlete_id
  `;
  return (rows as Array<{ athlete_id: string }>).map((row) =>
    String(row.athlete_id)
  );
}

function pointJson(point: PatternPoint): StrengthSeriesPointJson {
  return {
    date: point.date,
    reference_e1rm: point.referenceE1rm,
    source_movement: point.sourceMovement,
    load: point.load,
    reps: point.reps,
    rpe: point.rpe,
  };
}

function athletesFromSeries(
  athleteIds: readonly string[],
  series: ReturnType<typeof buildPatternSeries>
): StrengthSeriesAthleteJson[] {
  const byAthlete = new Map<string, Map<StrengthPattern, PatternPoint[]>>();
  for (const pattern of series) {
    for (const point of pattern.points) {
      let patterns = byAthlete.get(point.athleteId);
      if (!patterns) {
        patterns = new Map();
        byAthlete.set(point.athleteId, patterns);
      }
      const list = patterns.get(pattern.pattern);
      if (list) list.push(point);
      else patterns.set(pattern.pattern, [point]);
    }
  }

  return athleteIds.map((athleteId) => {
    const mine = byAthlete.get(athleteId);
    return {
      athlete_id: athleteId,
      patterns: series.map((pattern) => ({
        pattern: pattern.pattern,
        reference_name: pattern.referenceName,
        points: (mine?.get(pattern.pattern) ?? []).map(pointJson),
      })),
    };
  });
}

function medianJson(
  series: ReturnType<typeof buildPatternSeries>
): StrengthSeriesMedianJson[] {
  return carryForwardMedian(series).map((pattern) => ({
    pattern: pattern.pattern,
    points: pattern.points.map((point) => ({
      date: point.date,
      reference_e1rm: point.referenceE1rm,
    })),
  }));
}

export async function loadStrengthSeries(
  query: StrengthSeriesQuery
): Promise<StrengthSeriesData> {
  if ("athleteId" in query) {
    const sets = await loadAthleteSets(query.athleteId);
    const series = buildPatternSeries(sets);
    return { athletes: athletesFromSeries([query.athleteId], series) };
  }

  const [athleteIds, sets] = await Promise.all([
    loadRosterAthleteIds(query.hugoGroup),
    loadGroupSets(query),
  ]);
  const series = buildPatternSeries(sets);
  return {
    athletes: athletesFromSeries(athleteIds, series),
    median: medianJson(series),
  };
}
