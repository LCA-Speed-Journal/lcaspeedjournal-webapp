/**
 * Historical leaderboard API - GET (public).
 * Returns ranked rows for a date range + metric; optional group_by=gender.
 * Supports metric=MaxVelocity (max display_value across all mph-metric entries in range).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getVelocityMetricKeys, getMaxVelocityKey } from "@/lib/velocity-metrics";
import type { LeaderboardRow } from "@/types";

type Row = {
  rank: number;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  athlete_type: string;
  display_value: number;
  units: string;
  source_metric_key?: string;
};

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
    const isMaxVelocity = metric === getMaxVelocityKey();

    if (isMaxVelocity) {
      const velocityKeys = getVelocityMetricKeys();
      if (velocityKeys.length === 0) {
        return NextResponse.json(
          { error: "Max Velocity is not available (no mph metrics in registry)" },
          { status: 400 }
        );
      }

      const stringParts: string[] = [
        `WITH filtered AS (
          SELECT e.athlete_id, e.display_value, e.metric_key, e.units, a.first_name, a.last_name, a.gender, a.athlete_type
          FROM entries e
          INNER JOIN sessions s ON s.id = e.session_id
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE s.session_date >= `,
        `::date AND s.session_date <= `,
        `::date AND (`,
        ` OR s.phase = `,
        `) AND (e.metric_key = `,
      ];
      for (let i = 1; i < velocityKeys.length; i++) {
        stringParts.push(" OR e.metric_key = ");
      }
      stringParts.push(
        `) ), best AS (
          SELECT DISTINCT ON (athlete_id) athlete_id, display_value, metric_key AS source_metric_key, units, first_name, last_name, gender, athlete_type
          FROM filtered
          ORDER BY athlete_id, display_value DESC
        )
        SELECT (ROW_NUMBER() OVER (ORDER BY display_value DESC))::int AS rank, athlete_id, first_name, last_name, gender, athlete_type, display_value, units, source_metric_key
        FROM best ORDER BY rank`
      );
      const template = Object.assign([...stringParts], {
        raw: stringParts,
      }) as TemplateStringsArray;
      const result = await sql(
        template,
        from,
        to,
        phase === "",
        phase,
        ...velocityKeys
      );

      const rows = (result.rows as Row[]) ?? [];
      const leaderboardRows: LeaderboardRow[] = rows.map((r) => ({
        rank: r.rank,
        athlete_id: r.athlete_id,
        first_name: r.first_name,
        last_name: r.last_name,
        gender: r.gender,
        athlete_type: (r.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
        display_value: Number(r.display_value),
        units: r.units,
        source_metric_key: r.source_metric_key,
      }));

      const male = leaderboardRows.filter(
        (r) => r.gender?.toLowerCase() === "m" || r.gender?.toLowerCase() === "male"
      );
      const female = leaderboardRows.filter(
        (r) => r.gender?.toLowerCase() === "f" || r.gender?.toLowerCase() === "female"
      );

      return NextResponse.json({
        data: {
          rows: leaderboardRows,
          male,
          female,
          units: "mph",
          metric_display_name: "Max Velocity",
        },
      });
    }

    const metricDef = registry[metric];
    if (!metricDef) {
      return NextResponse.json(
        { error: `Unknown metric: ${metric}` },
        { status: 400 }
      );
    }

    const sortAsc = (metricDef.display_units ?? "").toLowerCase() === "s";

    let result: Awaited<ReturnType<typeof sql>>;
    if (sortAsc) {
      const ascResult = await sql`
      WITH filtered AS (
        SELECT e.athlete_id, e.display_value, e.units, a.first_name, a.last_name, a.gender, a.athlete_type
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        INNER JOIN athletes a ON a.id = e.athlete_id
        WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
          AND (${phase === ""} OR s.phase = ${phase})
          AND e.metric_key = ${metric}
      ),
      best AS (
        SELECT DISTINCT ON (athlete_id) athlete_id, display_value, units, first_name, last_name, gender, athlete_type
        FROM filtered
        ORDER BY athlete_id, display_value ASC
      )
      SELECT (ROW_NUMBER() OVER (ORDER BY display_value ASC))::int AS rank, athlete_id, first_name, last_name, gender, athlete_type, display_value, units
      FROM best ORDER BY rank
    `;
      result = ascResult;
    } else {
      const descResult = await sql`
      WITH filtered AS (
        SELECT e.athlete_id, e.display_value, e.units, a.first_name, a.last_name, a.gender, a.athlete_type
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        INNER JOIN athletes a ON a.id = e.athlete_id
        WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
          AND (${phase === ""} OR s.phase = ${phase})
          AND e.metric_key = ${metric}
      ),
      best AS (
        SELECT DISTINCT ON (athlete_id) athlete_id, display_value, units, first_name, last_name, gender, athlete_type
        FROM filtered
        ORDER BY athlete_id, display_value DESC
      )
      SELECT (ROW_NUMBER() OVER (ORDER BY display_value DESC))::int AS rank, athlete_id, first_name, last_name, gender, athlete_type, display_value, units
      FROM best ORDER BY rank
    `;
      result = descResult;
    }

    const rows = (result.rows as Row[]) ?? [];
    const leaderboardRows: LeaderboardRow[] = rows.map((r) => ({
      rank: r.rank,
      athlete_id: r.athlete_id,
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender,
      athlete_type: (r.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
      display_value: Number(r.display_value),
      units: r.units,
    }));

    const male = leaderboardRows.filter(
      (r) => r.gender?.toLowerCase() === "m" || r.gender?.toLowerCase() === "male"
    );
    const female = leaderboardRows.filter(
      (r) => r.gender?.toLowerCase() === "f" || r.gender?.toLowerCase() === "female"
    );

    return NextResponse.json({
      data: {
        rows: leaderboardRows,
        male,
        female,
        units: metricDef.display_units ?? "",
        metric_display_name: metricDef.display_name ?? metric,
      },
    });
  } catch (err) {
    console.error("GET /api/leaderboard/historical:", err);
    return NextResponse.json(
      { error: "Failed to fetch historical leaderboard" },
      { status: 500 }
    );
  }
}
