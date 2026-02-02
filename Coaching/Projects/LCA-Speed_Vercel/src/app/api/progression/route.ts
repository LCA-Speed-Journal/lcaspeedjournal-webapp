/**
 * Progression API - GET (public).
 * Returns best per session/date for athlete(s) and metric; optional team_avg by gender.
 * Supports multiple athlete_id (cap 8), metric=MaxVelocity, and team_avg=1.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getVelocityMetricKeys, getMaxVelocityKey } from "@/lib/velocity-metrics";
import type { ProgressionPoint } from "@/types";

const MAX_ATHLETES = 8;

type ProgressionRow = {
  session_date: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  units: string;
  display_value: number;
};

function isMale(g: string): boolean {
  const lower = (g ?? "").toLowerCase();
  return lower === "m" || lower === "male";
}
function isFemale(g: string): boolean {
  const lower = (g ?? "").toLowerCase();
  return lower === "f" || lower === "female";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const athleteIds = searchParams.getAll("athlete_id");
    const athlete_id = searchParams.get("athlete_id");
    const metric = searchParams.get("metric");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const teamAvg = searchParams.get("team_avg") === "1";

    const ids = athleteIds.length > 0 ? athleteIds : (athlete_id ? [athlete_id] : []);
    const cappedIds = ids.slice(0, MAX_ATHLETES);

    if (!metric || !from || !to || cappedIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required query params: athlete_id (or athlete_ids), metric, from, to" },
        { status: 400 }
      );
    }

    const registry = getMetricsRegistry();
    const isMaxVelocity = metric === getMaxVelocityKey();

    let rows: ProgressionRow[] = [];
    let units = "";
    let metricDisplayName = metric;

    if (isMaxVelocity) {
      const velocityKeys = getVelocityMetricKeys();
      if (velocityKeys.length === 0) {
        return NextResponse.json(
          { error: "Max Velocity is not available (no mph metrics in registry)" },
          { status: 400 }
        );
      }
      units = "mph";
      metricDisplayName = "Max Velocity";

      const stringParts: string[] = [
        `SELECT s.session_date::text, e.athlete_id::text, a.first_name, a.last_name, a.gender, 'mph' AS units, MAX(e.display_value) AS display_value
FROM entries e
INNER JOIN sessions s ON s.id = e.session_id
INNER JOIN athletes a ON a.id = e.athlete_id
WHERE s.session_date >= `,
        `::date AND s.session_date <= `,
        `::date AND (e.athlete_id = `,
      ];
      for (let i = 1; i < cappedIds.length; i++) {
        stringParts.push(" OR e.athlete_id = ");
      }
      stringParts.push(") AND (e.metric_key = ");
      for (let i = 1; i < velocityKeys.length; i++) {
        stringParts.push(" OR e.metric_key = ");
      }
      stringParts.push(
        `)
GROUP BY s.session_date, e.athlete_id, a.first_name, a.last_name, a.gender
ORDER BY s.session_date, e.athlete_id`
      );
      const template = Object.assign([...stringParts], { raw: stringParts }) as TemplateStringsArray;
      const result = await sql(
        template,
        from,
        to,
        ...cappedIds,
        ...velocityKeys
      );
      rows = (result.rows as ProgressionRow[]) ?? [];
    } else {
      const metricDef = registry[metric];
      if (!metricDef) {
        return NextResponse.json(
          { error: `Unknown metric: ${metric}` },
          { status: 400 }
        );
      }
      units = metricDef.display_units ?? "";
      metricDisplayName = metricDef.display_name ?? metric;
      const sortAsc = (metricDef.display_units ?? "").toLowerCase() === "s";
      const agg = sortAsc ? "MIN" : "MAX";

      const stringParts: string[] = [
        `SELECT s.session_date::text, e.athlete_id::text, a.first_name, a.last_name, a.gender, e.units, ${agg}(e.display_value) AS display_value
FROM entries e
INNER JOIN sessions s ON s.id = e.session_id
INNER JOIN athletes a ON a.id = e.athlete_id
WHERE s.session_date >= `,
        `::date AND s.session_date <= `,
        `::date AND e.metric_key = `,
        ` AND (e.athlete_id = `,
      ];
      for (let i = 1; i < cappedIds.length; i++) {
        stringParts.push(" OR e.athlete_id = ");
      }
      stringParts.push(
        `)
GROUP BY s.session_date, e.athlete_id, a.first_name, a.last_name, a.gender, e.units
ORDER BY s.session_date, e.athlete_id`
      );
      const template = Object.assign([...stringParts], { raw: stringParts }) as TemplateStringsArray;
      const result = await sql(
        template,
        from,
        to,
        metric,
        ...cappedIds
      );
      rows = (result.rows as ProgressionRow[]) ?? [];
    }

    const pointsByAthlete = new Map<string, ProgressionPoint[]>();
    const athleteMeta = new Map<string, { first_name: string; last_name: string; gender: string }>();

    for (const r of rows) {
      const key = r.athlete_id;
      if (!athleteMeta.has(key)) {
        athleteMeta.set(key, { first_name: r.first_name, last_name: r.last_name, gender: r.gender });
      }
      const pts = pointsByAthlete.get(key) ?? [];
      pts.push({ session_date: r.session_date, display_value: Number(r.display_value), units: r.units });
      pointsByAthlete.set(key, pts);
    }

    let teamAvgMale: ProgressionPoint[] = [];
    let teamAvgFemale: ProgressionPoint[] = [];

    if (teamAvg) {
      // Team averages: from all athletes who have data in each session (not just selected).
      let allRows: ProgressionRow[] = [];
      if (isMaxVelocity) {
        const velocityKeys = getVelocityMetricKeys();
        const stringParts: string[] = [
          `SELECT s.session_date::text, e.athlete_id::text, a.first_name, a.last_name, a.gender, 'mph' AS units, MAX(e.display_value) AS display_value
FROM entries e
INNER JOIN sessions s ON s.id = e.session_id
INNER JOIN athletes a ON a.id = e.athlete_id
WHERE s.session_date >= `,
          `::date AND s.session_date <= `,
          `::date AND (e.metric_key = `,
        ];
        for (let i = 1; i < velocityKeys.length; i++) {
          stringParts.push(" OR e.metric_key = ");
        }
        stringParts.push(
          `)
GROUP BY s.session_date, e.athlete_id, a.first_name, a.last_name, a.gender
ORDER BY s.session_date, e.athlete_id`
        );
        const template = Object.assign([...stringParts], { raw: stringParts }) as TemplateStringsArray;
        const result = await sql(template, from, to, ...velocityKeys);
        allRows = (result.rows as ProgressionRow[]) ?? [];
      } else {
        const metricDef = registry[metric];
        if (metricDef) {
          const sortAsc = (metricDef.display_units ?? "").toLowerCase() === "s";
          if (sortAsc) {
            const result = await sql`
              SELECT s.session_date::text, e.athlete_id::text, a.first_name, a.last_name, a.gender, e.units, MIN(e.display_value) AS display_value
              FROM entries e
              INNER JOIN sessions s ON s.id = e.session_id
              INNER JOIN athletes a ON a.id = e.athlete_id
              WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
                AND e.metric_key = ${metric}
              GROUP BY s.session_date, e.athlete_id, a.first_name, a.last_name, a.gender, e.units
              ORDER BY s.session_date, e.athlete_id
            `;
            allRows = (result.rows as ProgressionRow[]) ?? [];
          } else {
            const result = await sql`
              SELECT s.session_date::text, e.athlete_id::text, a.first_name, a.last_name, a.gender, e.units, MAX(e.display_value) AS display_value
              FROM entries e
              INNER JOIN sessions s ON s.id = e.session_id
              INNER JOIN athletes a ON a.id = e.athlete_id
              WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
                AND e.metric_key = ${metric}
              GROUP BY s.session_date, e.athlete_id, a.first_name, a.last_name, a.gender, e.units
              ORDER BY s.session_date, e.athlete_id
            `;
            allRows = (result.rows as ProgressionRow[]) ?? [];
          }
        }
      }

      const bySessionGender = new Map<string, { male: number[]; female: number[] }>();
      for (const r of allRows) {
        const sessionKey = r.session_date;
        const g = bySessionGender.get(sessionKey) ?? { male: [], female: [] };
        const v = Number(r.display_value);
        if (isMale(r.gender)) g.male.push(v);
        if (isFemale(r.gender)) g.female.push(v);
        bySessionGender.set(sessionKey, g);
      }

      const sortedDates = Array.from(bySessionGender.keys()).sort();
      teamAvgMale = sortedDates.map((session_date) => {
        const g = bySessionGender.get(session_date)!;
        const display_value = g.male.length > 0 ? g.male.reduce((a, b) => a + b, 0) / g.male.length : 0;
        return { session_date, display_value, units };
      });
      teamAvgFemale = sortedDates.map((session_date) => {
        const g = bySessionGender.get(session_date)!;
        const display_value = g.female.length > 0 ? g.female.reduce((a, b) => a + b, 0) / g.female.length : 0;
        return { session_date, display_value, units };
      });
    }

    const series = cappedIds.map((id) => {
      const meta = athleteMeta.get(id) ?? { first_name: "", last_name: "", gender: "" };
      const points = (pointsByAthlete.get(id) ?? []).sort(
        (a, b) => a.session_date.localeCompare(b.session_date)
      );
      return {
        athlete_id: id,
        first_name: meta.first_name,
        last_name: meta.last_name,
        points,
      };
    });

    const payload: {
      data: {
        points?: ProgressionPoint[];
        series?: { athlete_id: string; first_name: string; last_name: string; points: ProgressionPoint[] }[];
        metric_display_name: string;
        units: string;
        team_avg_male_points?: ProgressionPoint[];
        team_avg_female_points?: ProgressionPoint[];
      };
    } = {
      data: {
        metric_display_name: metricDisplayName,
        units,
        ...(teamAvg ? { team_avg_male_points: teamAvgMale, team_avg_female_points: teamAvgFemale } : {}),
      },
    };

    if (cappedIds.length === 1) {
      payload.data.points = series[0]?.points ?? [];
    } else {
      payload.data.series = series;
    }

    return NextResponse.json({ data: payload.data });
  } catch (err) {
    console.error("GET /api/progression:", err);
    return NextResponse.json(
      { error: "Failed to fetch progression" },
      { status: 500 }
    );
  }
}
