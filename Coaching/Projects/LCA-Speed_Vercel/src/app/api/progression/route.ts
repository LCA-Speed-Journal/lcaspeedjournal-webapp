/**
 * Progression API - GET (public).
 * Best value per session for one athlete + metric; optional from/to date range.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import type { ProgressionPoint } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const athlete_id = searchParams.get("athlete_id");
    const metric = searchParams.get("metric");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!athlete_id || !metric) {
      return NextResponse.json(
        { error: "Missing required query params: athlete_id, metric" },
        { status: 400 }
      );
    }

    const registry = getMetricsRegistry();
    const metricDef = registry[metric];
    if (!metricDef) {
      return NextResponse.json(
        { error: `Unknown metric: ${metric}` },
        { status: 400 }
      );
    }

    const sortAsc = (metricDef.display_units ?? "").toLowerCase() === "s";

    type Row = {
      session_id: string;
      session_date: string;
      display_value: number;
      units: string;
    };

    let result;
    if (from && to) {
      result = sortAsc
        ? await sql`
            WITH best_per_session AS (
              SELECT DISTINCT ON (e.session_id)
                e.session_id,
                s.session_date,
                e.display_value,
                e.units
              FROM entries e
              INNER JOIN sessions s ON s.id = e.session_id
              WHERE e.athlete_id = ${athlete_id}::uuid
                AND e.metric_key = ${metric}
                AND s.session_date >= ${from}::date
                AND s.session_date <= ${to}::date
              ORDER BY e.session_id, e.display_value ASC
            )
            SELECT session_id, session_date::text AS session_date, display_value, units
            FROM best_per_session
            ORDER BY session_date ASC
          `
        : await sql`
            WITH best_per_session AS (
              SELECT DISTINCT ON (e.session_id)
                e.session_id,
                s.session_date,
                e.display_value,
                e.units
              FROM entries e
              INNER JOIN sessions s ON s.id = e.session_id
              WHERE e.athlete_id = ${athlete_id}::uuid
                AND e.metric_key = ${metric}
                AND s.session_date >= ${from}::date
                AND s.session_date <= ${to}::date
              ORDER BY e.session_id, e.display_value DESC
            )
            SELECT session_id, session_date::text AS session_date, display_value, units
            FROM best_per_session
            ORDER BY session_date ASC
          `;
    } else {
      result = sortAsc
        ? await sql`
            WITH best_per_session AS (
              SELECT DISTINCT ON (e.session_id)
                e.session_id,
                s.session_date,
                e.display_value,
                e.units
              FROM entries e
              INNER JOIN sessions s ON s.id = e.session_id
              WHERE e.athlete_id = ${athlete_id}::uuid
                AND e.metric_key = ${metric}
              ORDER BY e.session_id, e.display_value ASC
            )
            SELECT session_id, session_date::text AS session_date, display_value, units
            FROM best_per_session
            ORDER BY session_date ASC
          `
        : await sql`
            WITH best_per_session AS (
              SELECT DISTINCT ON (e.session_id)
                e.session_id,
                s.session_date,
                e.display_value,
                e.units
              FROM entries e
              INNER JOIN sessions s ON s.id = e.session_id
              WHERE e.athlete_id = ${athlete_id}::uuid
                AND e.metric_key = ${metric}
              ORDER BY e.session_id, e.display_value DESC
            )
            SELECT session_id, session_date::text AS session_date, display_value, units
            FROM best_per_session
            ORDER BY session_date ASC
          `;
    }

    const rows = result.rows as Row[];
    const points: ProgressionPoint[] = rows.map((r) => ({
      session_id: r.session_id,
      session_date:
        typeof r.session_date === "string"
          ? r.session_date
          : (r.session_date as Date).toISOString().slice(0, 10),
      display_value: Number(r.display_value),
      units: r.units,
    }));

    return NextResponse.json({
      data: {
        points,
        metric_display_name: metricDef.display_name ?? metric,
        units: metricDef.display_units ?? "",
      },
    });
  } catch (err) {
    console.error("GET /api/progression:", err);
    return NextResponse.json(
      { error: "Failed to fetch progression" },
      { status: 500 }
    );
  }
}
