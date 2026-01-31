/**
 * Historical leaderboard API - GET (public).
 * Best mark per athlete in date range (optional phase). Same response shape as live leaderboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import type { LeaderboardRow } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const metric = searchParams.get("metric");
    const phase = searchParams.get("phase") ?? "";
    const group_by = searchParams.get("group_by") ?? "";

    if (!from || !to || !metric) {
      return NextResponse.json(
        { error: "Missing required query params: from, to, metric" },
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
        WITH filtered AS (
          SELECT e.athlete_id, e.display_value, e.units, a.first_name, a.last_name, a.gender
          FROM entries e
          INNER JOIN sessions s ON s.id = e.session_id
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
            AND e.metric_key = ${metric}
            AND (${phase} = '' OR s.phase = ${phase})
        ),
        best AS (
          SELECT DISTINCT ON (athlete_id)
            athlete_id, display_value, units, first_name, last_name, gender
          FROM filtered
          ORDER BY athlete_id, display_value ASC
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
        WITH filtered AS (
          SELECT e.athlete_id, e.display_value, e.units, a.first_name, a.last_name, a.gender
          FROM entries e
          INNER JOIN sessions s ON s.id = e.session_id
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
            AND e.metric_key = ${metric}
            AND (${phase} = '' OR s.phase = ${phase})
        ),
        best AS (
          SELECT DISTINCT ON (athlete_id)
            athlete_id, display_value, units, first_name, last_name, gender
          FROM filtered
          ORDER BY athlete_id, display_value DESC
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
      const male = leaderboardRows.filter(
        (r) => r.gender?.toLowerCase() === "m" || r.gender?.toLowerCase() === "male"
      );
      const female = leaderboardRows.filter(
        (r) => r.gender?.toLowerCase() === "f" || r.gender?.toLowerCase() === "female"
      );
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
    console.error("GET /api/leaderboard/historical:", err);
    return NextResponse.json(
      { error: "Failed to fetch historical leaderboard" },
      { status: 500 }
    );
  }
}
