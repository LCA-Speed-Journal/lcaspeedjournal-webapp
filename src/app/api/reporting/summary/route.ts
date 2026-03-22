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
} from "@/types/reporting";

const SLOW_MS = 2000;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function toMetricAgg(
  row: {
    metric_key: string;
    n: number | string;
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
          COUNT(*)::int AS n,
          MIN(e.display_value) AS min,
          MAX(e.display_value) AS max,
          AVG(e.display_value) AS avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY e.display_value) AS median
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
        GROUP BY e.metric_key
        ORDER BY n DESC, e.metric_key ASC
      `,
      sql`
        SELECT
          a.id AS athlete_id,
          a.first_name,
          a.last_name,
          a.gender,
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
          COUNT(*)::int AS n,
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
      n: number;
      min: unknown;
      max: unknown;
      avg: unknown;
      median: unknown;
    }>).map((row) =>
      toMetricAgg(row, registry[row.metric_key]?.display_name ?? row.metric_key)
    );

    const metricsByAthlete = new Map<string, ReportingMetricAgg[]>();
    for (const row of athleteMetricsRes.rows as Array<{
      athlete_id: string;
      metric_key: string;
      n: number;
      min: unknown;
      max: unknown;
      avg: unknown;
      median: unknown;
    }>) {
      const label = registry[row.metric_key]?.display_name ?? row.metric_key;
      const agg = toMetricAgg(row, label);
      const list = metricsByAthlete.get(row.athlete_id) ?? [];
      list.push(agg);
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
        athlete_type: string;
        entry_count: number;
        session_count: number;
      }>
    ).map((r) => ({
      athlete_id: r.athlete_id,
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender,
      athlete_type: r.athlete_type,
      entry_count: n(r.entry_count),
      session_count: n(r.session_count),
      metrics: metricsByAthlete.get(r.athlete_id) ?? [],
    }));

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
    };

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/reporting/summary:", err);
    return NextResponse.json({ error: "Failed to fetch reporting summary" }, { status: 500 });
  }
}
