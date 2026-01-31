/**
 * Leaderboard API - GET (public).
 * Returns ranked rows for a session + metric; optional group_by=gender.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import type { LeaderboardRow } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");
    const metric = searchParams.get("metric");
    const group_by = searchParams.get("group_by") ?? "";
    const interval_index_param = searchParams.get("interval_index");
    const component_param = searchParams.get("component");
    const interval_index = interval_index_param != null && interval_index_param !== "" ? parseInt(interval_index_param, 10) : null;
    const component = component_param != null && component_param !== "" ? component_param : null;

    if (!session_id || !metric) {
      return NextResponse.json(
        { error: "Missing required query params: session_id, metric" },
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

    // Session exists?
    const sessionRows = await sql`
      SELECT id FROM sessions WHERE id = ${session_id} LIMIT 1
    `;
    if (!sessionRows.rows.length) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Time (e.g. "s") = lower is better = ascending; else descending
    const sortAsc = (metricDef.display_units ?? "").toLowerCase() === "s";

    type Row = {
      rank: number;
      athlete_id: string;
      first_name: string;
      last_name: string;
      gender: string;
      display_value: number;
      units: string;
    };

    let rows: Row[];

    if (sortAsc) {
      const result = await sql`
        WITH best AS (
          SELECT DISTINCT ON (e.athlete_id)
            e.athlete_id,
            e.display_value,
            e.units,
            a.first_name,
            a.last_name,
            a.gender
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
            AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
            AND (${component}::text IS NULL OR e.component = ${component})
          ORDER BY e.athlete_id, e.display_value ASC
        )
        SELECT
          (ROW_NUMBER() OVER (ORDER BY display_value ASC))::int AS rank,
          athlete_id,
          first_name,
          last_name,
          gender,
          display_value,
          units
        FROM best
        ORDER BY rank
      `;
      rows = result.rows as Row[];
    } else {
      const result = await sql`
        WITH best AS (
          SELECT DISTINCT ON (e.athlete_id)
            e.athlete_id,
            e.display_value,
            e.units,
            a.first_name,
            a.last_name,
            a.gender
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
            AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
            AND (${component}::text IS NULL OR e.component = ${component})
          ORDER BY e.athlete_id, e.display_value DESC
        )
        SELECT
          (ROW_NUMBER() OVER (ORDER BY display_value DESC))::int AS rank,
          athlete_id,
          first_name,
          last_name,
          gender,
          display_value,
          units
        FROM best
        ORDER BY rank
      `;
      rows = result.rows as Row[];
    }

    const leaderboardRows: LeaderboardRow[] = rows.map((r) => ({
      rank: r.rank,
      athlete_id: r.athlete_id,
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender,
      display_value: Number(r.display_value),
      units: r.units,
    }));

    const payload = {
      data: {
        rows: leaderboardRows,
        metric_display_name: metricDef.display_name ?? metric,
        units: metricDef.display_units ?? "",
        sort_asc: sortAsc,
      },
    };

    if (group_by === "gender") {
      const male = leaderboardRows.filter((r) => r.gender?.toLowerCase() === "m" || r.gender?.toLowerCase() === "male");
      const female = leaderboardRows.filter((r) => r.gender?.toLowerCase() === "f" || r.gender?.toLowerCase() === "female");
      return NextResponse.json({
        ...payload,
        data: {
          ...payload.data,
          male,
          female,
          rows: leaderboardRows,
        },
      });
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/leaderboard:", err);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
