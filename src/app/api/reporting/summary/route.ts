/**
 * Reporting summary — GET (public).
 * JSON aggregates by metric_key (display_value) for team and per athlete.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { getMetricsRegistry } from "@/lib/parser";
import type {
  ReportingAthleteSummary,
  ReportingMetricAgg,
  ReportingSummaryData,
  ReportingTopPerformer,
} from "@/types/reporting";

const SLOW_MS = 2000;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function toMetricAgg(
  row: {
    metric_key: string;
    n: number;
    min: unknown;
    max: unknown;
    avg: unknown;
    median: unknown;
  },
  label: string
): ReportingMetricAgg {
  return {
    metric_key: row.metric_key,
    metric_label: label,
    n: n(row.n),
    min: n(row.min),
    max: n(row.max),
    avg: n(row.avg),
    median: n(row.median),
  };
}

function percentileRankScores(
  values: Array<{ athlete_id: string; best_value: number }>,
  ascending: boolean
): Map<string, number> {
  const sorted = [...values].sort((a, b) =>
    ascending ? a.best_value - b.best_value : b.best_value - a.best_value
  );
  const nRows = sorted.length;
  const out = new Map<string, number>();
  if (nRows === 0) return out;
  if (nRows === 1) {
    out.set(sorted[0].athlete_id, 1);
    return out;
  }

  let idx = 0;
  while (idx < nRows) {
    const value = sorted[idx].best_value;
    const rank = idx + 1;
    let j = idx;
    while (j < nRows && sorted[j].best_value === value) {
      j += 1;
    }
    const percentRank = (rank - 1) / (nRows - 1);
    const score = 1 - percentRank;
    for (let k = idx; k < j; k++) {
      out.set(sorted[k].athlete_id, score);
    }
    idx = j;
  }

  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = parseReportingDateRange({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { from, to } = parsed;

  const t0 = performance.now();
  try {
    const registry = getMetricsRegistry();
    const accelCumulativeKeys = new Set(
      Object.entries(registry)
        .filter(
          ([, v]) =>
            (v.subcategory ?? "").toLowerCase() === "acceleration" &&
            v.input_structure === "cumulative"
        )
        .map(([k]) => k)
    );
    const ascendingMetricKeys = new Set(
      Object.entries(registry)
        .filter(([, v]) => (v.display_units ?? "").toLowerCase() === "s")
        .map(([k]) => k)
    );

    const [countsRes, teamMetricsRes, athletesRes, athleteMetricsRes] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS entry_count,
          COUNT(DISTINCT t.session_id)::int AS session_count,
          COUNT(DISTINCT t.athlete_id)::int AS athlete_count
        FROM (
          SELECT e.session_id, e.athlete_id
          FROM entries e
          INNER JOIN sessions s ON s.id = e.session_id
          WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
        ) t
      `,
      sql`
        SELECT
          e.metric_key,
          COUNT(*)::int AS total_n,
          SUM(CASE WHEN e.interval_index IS NULL THEN 1 ELSE 0 END)::int AS null_interval_n,
          MIN(e.display_value) AS min,
          MAX(e.display_value) AS max,
          AVG(e.display_value) AS avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY e.display_value) AS median
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
        GROUP BY e.metric_key
        ORDER BY total_n DESC, e.metric_key ASC
      `,
      sql`
        SELECT
          a.id AS athlete_id,
          a.first_name,
          a.last_name,
          a.gender,
          a.graduating_class,
          a.athlete_type,
          COUNT(*)::int AS entry_count,
          COUNT(DISTINCT e.session_id)::int AS session_count
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        INNER JOIN athletes a ON a.id = e.athlete_id
        WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
        GROUP BY a.id, a.first_name, a.last_name, a.gender, a.athlete_type
        ORDER BY a.last_name ASC, a.first_name ASC
      `,
      sql`
        SELECT
          e.athlete_id,
          e.metric_key,
          COUNT(*)::int AS total_n,
          SUM(CASE WHEN e.interval_index IS NULL THEN 1 ELSE 0 END)::int AS null_interval_n,
          MIN(e.display_value) AS min,
          MAX(e.display_value) AS max,
          AVG(e.display_value) AS avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY e.display_value) AS median
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
        GROUP BY e.athlete_id, e.metric_key
      `,
    ]);

    const elapsed = performance.now() - t0;
    if (elapsed > SLOW_MS) {
      console.warn(
        `[GET /api/reporting/summary] slow query ${Math.round(elapsed)}ms from=${from} to=${to}`
      );
    }

    const countsRow = countsRes.rows[0] as {
      entry_count: number;
      session_count: number;
      athlete_count: number;
    };

    const teamMetrics: ReportingMetricAgg[] = (teamMetricsRes.rows as Array<{
      metric_key: string;
      total_n: number;
      null_interval_n: number;
      min: unknown;
      max: unknown;
      avg: unknown;
      median: unknown;
    }>).map((row) => {
      const nValue = accelCumulativeKeys.has(row.metric_key)
        ? n(row.null_interval_n)
        : n(row.total_n);
      return toMetricAgg(
        {
          metric_key: row.metric_key,
          n: nValue,
          min: row.min,
          max: row.max,
          avg: row.avg,
          median: row.median,
        },
        registry[row.metric_key]?.display_name ?? row.metric_key
      );
    });

    const metricsByAthlete = new Map<string, ReportingMetricAgg[]>();
    for (const row of athleteMetricsRes.rows as Array<{
      athlete_id: string;
      metric_key: string;
      total_n: number;
      null_interval_n: number;
      min: unknown;
      max: unknown;
      avg: unknown;
      median: unknown;
    }>) {
      const label = registry[row.metric_key]?.display_name ?? row.metric_key;
      const nValue = accelCumulativeKeys.has(row.metric_key)
        ? n(row.null_interval_n)
        : n(row.total_n);
      const agg = toMetricAgg(
        {
          metric_key: row.metric_key,
          n: nValue,
          min: row.min,
          max: row.max,
          avg: row.avg,
          median: row.median,
        },
        label
      );
      const list = metricsByAthlete.get(row.athlete_id) ?? [];
      if (agg.n > 0) list.push(agg);
      metricsByAthlete.set(row.athlete_id, list);
    }
    for (const list of metricsByAthlete.values()) {
      list.sort((a, b) => a.metric_key.localeCompare(b.metric_key));
    }

    const athletes: ReportingAthleteSummary[] = (
      athletesRes.rows as Array<{
        athlete_id: string;
        first_name: string;
        last_name: string;
        gender: string;
        graduating_class: number | null;
        athlete_type: string;
        entry_count: number;
        session_count: number;
      }>
    ).map((r) => ({
      athlete_id: r.athlete_id,
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender,
      graduating_class: r.graduating_class ?? null,
      athlete_type: r.athlete_type,
      entry_count: n(r.entry_count),
      session_count: n(r.session_count),
      metrics: metricsByAthlete.get(r.athlete_id) ?? [],
    }));

    const athleteById = new Map(
      athletes.map((a) => [a.athlete_id, a] as const)
    );
    const metricToAthletes = new Map<string, Array<{ athlete_id: string; best_value: number }>>();
    for (const row of athleteMetricsRes.rows as Array<{
      athlete_id: string;
      metric_key: string;
      min: unknown;
      max: unknown;
      total_n: number;
      null_interval_n: number;
    }>) {
      const effectiveN = accelCumulativeKeys.has(row.metric_key)
        ? n(row.null_interval_n)
        : n(row.total_n);
      if (effectiveN <= 0) continue;
      const bestValue = ascendingMetricKeys.has(row.metric_key) ? n(row.min) : n(row.max);
      if (!Number.isFinite(bestValue)) continue;
      const list = metricToAthletes.get(row.metric_key) ?? [];
      list.push({ athlete_id: row.athlete_id, best_value: bestValue });
      metricToAthletes.set(row.metric_key, list);
    }

    const scoreByAthlete = new Map<string, { total: number; count: number }>();
    for (const [metricKey, metricRows] of metricToAthletes.entries()) {
      const asc = ascendingMetricKeys.has(metricKey);
      const scores = percentileRankScores(metricRows, asc);
      for (const [athleteId, score] of scores.entries()) {
        const cur = scoreByAthlete.get(athleteId) ?? { total: 0, count: 0 };
        cur.total += score;
        cur.count += 1;
        scoreByAthlete.set(athleteId, cur);
      }
    }

    const topPerformers: ReportingTopPerformer[] = Array.from(scoreByAthlete.entries())
      .map(([athleteId, score]) => {
        const athlete = athleteById.get(athleteId);
        if (!athlete || score.count === 0) return null;
        return {
          rank: 0,
          athlete_id: athlete.athlete_id,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
          athlete_type: athlete.athlete_type,
          metric_count: score.count,
          avg_percentile_rank: score.total / score.count,
        };
      })
      .filter((x): x is ReportingTopPerformer => x !== null)
      .sort(
        (a, b) =>
          b.avg_percentile_rank - a.avg_percentile_rank ||
          b.metric_count - a.metric_count ||
          a.last_name.localeCompare(b.last_name) ||
          a.first_name.localeCompare(b.first_name)
      )
      .slice(0, 10)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));

    const data: ReportingSummaryData = {
      from,
      to,
      team: {
        session_count: n(countsRow?.session_count),
        athlete_count: n(countsRow?.athlete_count),
        entry_count: n(countsRow?.entry_count),
        metrics: teamMetrics,
      },
      athletes,
      top_performers: topPerformers,
    };

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/reporting/summary:", err);
    return NextResponse.json({ error: "Failed to fetch reporting summary" }, { status: 500 });
  }
}
