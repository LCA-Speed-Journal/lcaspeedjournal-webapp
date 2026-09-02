/**
 * Leaderboard API - GET (public).
 * Returns ranked rows for a session + metric; optional group_by=gender.
 * Includes optional session-to-session comparison (previous_display_value, percent_change, trend).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import {
  applyLeaderboardZones,
  forPublicLeaderboard,
  mapThresholdRows,
  parsePopulationIdParam,
  resolveSelectedPopulation,
  type RawThresholdRow,
} from "@/lib/norms/leaderboard-zones";
import type {
  AttachZonesDefault,
  AttachZonesMembership,
  AttachZonesPopulation,
} from "@/lib/norms/attach-zones";
import type { LeaderboardRow, LeaderboardTrend } from "@/types";

const TIME_NEUTRAL_BAND = 0.8;
const DISTANCE_NEUTRAL_BAND = 1.5;

function computeTrend(
  percentChange: number,
  sortAsc: boolean,
  band: number
): LeaderboardTrend {
  const abs = Math.abs(percentChange);
  if (abs <= band) return "neutral";
  if (sortAsc) {
    // Time: negative percent = improvement
    return percentChange < 0 ? "up" : "down";
  }
  // Distance/speed: positive percent = improvement
  return percentChange > 0 ? "up" : "down";
}

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
    const overallOnly = interval_index == null && component == null;

    if (!session_id || !metric) {
      return NextResponse.json(
        { error: "Missing required query params: session_id, metric" },
        { status: 400 }
      );
    }

    const parsedPopulation = parsePopulationIdParam(searchParams.get("population_id"));
    if (!parsedPopulation.ok) {
      return NextResponse.json(
        { error: parsedPopulation.error },
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

    const populationsPromise = Promise.resolve(
      sql`
        SELECT id, name
        FROM norm_populations
        WHERE archived_at IS NULL
        ORDER BY name ASC
      `
    ).catch((err: unknown) => {
      console.error("GET /api/leaderboard populations:", err);
      return null;
    });

    // Session exists and get session_date for previous-session lookup
    const sessionRows = await sql`
      SELECT id, session_date FROM sessions WHERE id = ${session_id} LIMIT 1
    `;
    if (!sessionRows.rows.length) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }
    const rawSessionDate = (sessionRows.rows[0] as { session_date: string | Date }).session_date;
    const sessionDateStr =
      typeof rawSessionDate === "string"
        ? rawSessionDate
        : rawSessionDate instanceof Date
          ? rawSessionDate.toISOString().slice(0, 10)
          : String(rawSessionDate).slice(0, 10);
    const sessionDate = new Date(sessionDateStr + "T12:00:00");
    const year = sessionDate.getFullYear();
    if (Number.isNaN(year)) {
      return NextResponse.json(
        { error: "Invalid session date" },
        { status: 400 }
      );
    }
    const seasonStart = `${year}-01-01`;
    const seasonEnd = `${year}-12-31`;
    // Determine effective units from filtered entries when possible; this lets
    // component-specific views (e.g., split-seconds under an mph metric key) sort correctly.
    let effectiveUnits = metricDef.display_units ?? "";
    const unitsProbe = await sql`
      SELECT e.units
      FROM entries e
      WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
        AND (
          (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
          OR (
            ${overallOnly}::boolean = false
            AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
            AND (${component}::text IS NULL OR e.component = ${component})
          )
        )
      LIMIT 1
    `;
    if (unitsProbe.rows.length > 0) {
      const probed = (unitsProbe.rows[0] as { units?: string }).units;
      if (typeof probed === "string" && probed.trim() !== "") {
        effectiveUnits = probed;
      }
    }

    // Time (e.g. "s") = lower is better = ascending; else descending
    const sortAsc = effectiveUnits.toLowerCase() === "s";
    const neutralBand = sortAsc ? TIME_NEUTRAL_BAND : DISTANCE_NEUTRAL_BAND;

    type Row = {
      rank: number;
      athlete_id: string;
      first_name: string;
      last_name: string;
      gender: string;
      athlete_type: string;
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
            a.gender,
            a.athlete_type
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
            AND (
              (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
              OR (
                ${overallOnly}::boolean = false
                AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                AND (${component}::text IS NULL OR e.component = ${component})
              )
            )
          ORDER BY e.athlete_id, e.display_value ASC
        )
        SELECT
          (ROW_NUMBER() OVER (ORDER BY display_value ASC))::int AS rank,
          athlete_id,
          first_name,
          last_name,
          gender,
          athlete_type,
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
            a.gender,
            a.athlete_type
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
            AND (
              (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
              OR (
                ${overallOnly}::boolean = false
                AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                AND (${component}::text IS NULL OR e.component = ${component})
              )
            )
          ORDER BY e.athlete_id, e.display_value DESC
        )
        SELECT
          (ROW_NUMBER() OVER (ORDER BY display_value DESC))::int AS rank,
          athlete_id,
          first_name,
          last_name,
          gender,
          athlete_type,
          display_value,
          units
        FROM best
        ORDER BY rank
      `;
      rows = result.rows as Row[];
    }

    // Previous-session best per athlete (most recent prior session, same metric+interval+component)
    type PrevRow = { athlete_id: string; previous_display_value: number; previous_session_date: string };
    const prevMap = new Map<string, { previous_display_value: number; previous_session_date: string }>();
    if (rows.length > 0) {
      const athleteIds = rows.map((r) => r.athlete_id);
      const prevResult = sortAsc
        ? await sql`
            WITH current_session AS (SELECT id, session_date FROM sessions WHERE id = ${session_id}),
            last_prior_session AS (
              SELECT e.athlete_id, MAX(s.session_date) AS prev_session_date
              FROM entries e
              JOIN sessions s ON s.id = e.session_id
              CROSS JOIN current_session cs
              WHERE s.session_date < cs.session_date
                AND e.metric_key = ${metric}
                AND (
                  (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                  OR (
                    ${overallOnly}::boolean = false
                    AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                    AND (${component}::text IS NULL OR e.component = ${component})
                  )
                )
                AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
              GROUP BY e.athlete_id
            ),
            prev_best AS (
              SELECT DISTINCT ON (e.athlete_id)
                e.athlete_id,
                e.display_value AS previous_display_value,
                s.session_date::text AS previous_session_date
              FROM entries e
              JOIN sessions s ON s.id = e.session_id
              JOIN last_prior_session l ON l.athlete_id = e.athlete_id AND l.prev_session_date = s.session_date
              WHERE e.metric_key = ${metric}
                AND (
                  (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                  OR (
                    ${overallOnly}::boolean = false
                    AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                    AND (${component}::text IS NULL OR e.component = ${component})
                  )
                )
              ORDER BY e.athlete_id, e.display_value ASC
            )
            SELECT athlete_id, previous_display_value, previous_session_date FROM prev_best
          `
        : await sql`
            WITH current_session AS (SELECT id, session_date FROM sessions WHERE id = ${session_id}),
            last_prior_session AS (
              SELECT e.athlete_id, MAX(s.session_date) AS prev_session_date
              FROM entries e
              JOIN sessions s ON s.id = e.session_id
              CROSS JOIN current_session cs
              WHERE s.session_date < cs.session_date
                AND e.metric_key = ${metric}
                AND (
                  (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                  OR (
                    ${overallOnly}::boolean = false
                    AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                    AND (${component}::text IS NULL OR e.component = ${component})
                  )
                )
                AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
              GROUP BY e.athlete_id
            ),
            prev_best AS (
              SELECT DISTINCT ON (e.athlete_id)
                e.athlete_id,
                e.display_value AS previous_display_value,
                s.session_date::text AS previous_session_date
              FROM entries e
              JOIN sessions s ON s.id = e.session_id
              JOIN last_prior_session l ON l.athlete_id = e.athlete_id AND l.prev_session_date = s.session_date
              WHERE e.metric_key = ${metric}
                AND (
                  (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                  OR (
                    ${overallOnly}::boolean = false
                    AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                    AND (${component}::text IS NULL OR e.component = ${component})
                  )
                )
              ORDER BY e.athlete_id, e.display_value DESC
            )
            SELECT athlete_id, previous_display_value, previous_session_date FROM prev_best
          `;
      for (const p of prevResult.rows as PrevRow[]) {
        const prevVal = Number(p.previous_display_value);
        if (prevVal !== 0) {
          prevMap.set(p.athlete_id, {
            previous_display_value: prevVal,
            previous_session_date: p.previous_session_date,
          });
        }
      }
    }

    type BestRow = { athlete_id: string; best_value: number };
    const allTimeBestMap = new Map<string, number>();
    if (rows.length > 0) {
      const athleteIds = rows.map((r) => r.athlete_id);
      const allTimeResult = sortAsc
        ? await sql`
            SELECT e.athlete_id, MIN(e.display_value)::float AS best_value
            FROM entries e
            WHERE e.metric_key = ${metric}
              AND (
                (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                OR (
                  ${overallOnly}::boolean = false
                  AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                  AND (${component}::text IS NULL OR e.component = ${component})
                )
              )
              AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
            GROUP BY e.athlete_id
          `
        : await sql`
            SELECT e.athlete_id, MAX(e.display_value)::float AS best_value
            FROM entries e
            WHERE e.metric_key = ${metric}
              AND (
                (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                OR (
                  ${overallOnly}::boolean = false
                  AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                  AND (${component}::text IS NULL OR e.component = ${component})
                )
              )
              AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
            GROUP BY e.athlete_id
          `;
      for (const r of allTimeResult.rows as BestRow[]) {
        allTimeBestMap.set(r.athlete_id, Number(r.best_value));
      }
    }

    const seasonBestMap = new Map<string, number>();
    if (rows.length > 0 && seasonStart && seasonEnd) {
      const athleteIds = rows.map((r) => r.athlete_id);
      const seasonResult = sortAsc
        ? await sql`
            SELECT e.athlete_id, MIN(e.display_value)::float AS best_value
            FROM entries e
            JOIN sessions s ON s.id = e.session_id
            WHERE e.metric_key = ${metric}
              AND (
                (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                OR (
                  ${overallOnly}::boolean = false
                  AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                  AND (${component}::text IS NULL OR e.component = ${component})
                )
              )
              AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
              AND s.session_date >= ${seasonStart}::date AND s.session_date <= ${seasonEnd}::date
            GROUP BY e.athlete_id
          `
        : await sql`
            SELECT e.athlete_id, MAX(e.display_value)::float AS best_value
            FROM entries e
            JOIN sessions s ON s.id = e.session_id
            WHERE e.metric_key = ${metric}
              AND (
                (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
                OR (
                  ${overallOnly}::boolean = false
                  AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
                  AND (${component}::text IS NULL OR e.component = ${component})
                )
              )
              AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
              AND s.session_date >= ${seasonStart}::date AND s.session_date <= ${seasonEnd}::date
            GROUP BY e.athlete_id
          `;
      for (const r of seasonResult.rows as BestRow[]) {
        seasonBestMap.set(r.athlete_id, Number(r.best_value));
      }
    }

    const leaderboardRows: LeaderboardRow[] = rows.map((r) => {
      const current = Number(r.display_value);
      const prev = prevMap.get(r.athlete_id);
      const out: LeaderboardRow = {
        rank: r.rank,
        athlete_id: r.athlete_id,
        first_name: r.first_name,
        last_name: r.last_name,
        gender: r.gender,
        athlete_type: (r.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
        display_value: current,
        units: r.units,
      };
      if (prev != null && prev.previous_display_value !== 0) {
        const percentChange = (current - prev.previous_display_value) / prev.previous_display_value * 100;
        const rounded = Math.round(percentChange * 10) / 10;
        out.previous_display_value = prev.previous_display_value;
        out.previous_session_date = prev.previous_session_date;
        out.percent_change = rounded;
        out.trend = computeTrend(rounded, sortAsc, neutralBand);
      }
      const allTimeBest = allTimeBestMap.get(r.athlete_id);
      const seasonBest = seasonBestMap.get(r.athlete_id);
      if (allTimeBest != null && Math.abs(current - allTimeBest) < 1e-9) {
        out.best_type = "pb";
      } else if (seasonBest != null && Math.abs(current - seasonBest) < 1e-9) {
        out.best_type = "sb";
      }
      return out;
    });

    let populations: AttachZonesPopulation[] = [];
    let populationsLoaded = false;
    const popResult = await populationsPromise;
    if (popResult != null) {
      populations = popResult.rows as AttachZonesPopulation[];
      populationsLoaded = true;
      const resolved = resolveSelectedPopulation(
        parsedPopulation.populationId,
        populations
      );
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
    }

    let zonedRows: LeaderboardRow[] = leaderboardRows;
    if (populationsLoaded) {
      try {
        const athleteIds = leaderboardRows.map((r) => r.athlete_id);
        const membershipsPromise =
          athleteIds.length > 0
            ? sql`
                SELECT athlete_id, hugo_group, is_primary
                FROM athlete_hugo_memberships
                WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
              `
            : Promise.resolve({ rows: [] as unknown[] });
        const [memResult, defResult, thrResult] = await Promise.all([
          membershipsPromise,
          sql`
            SELECT hugo_group, metric_key, population_id
            FROM norm_sport_defaults
            WHERE metric_key = ${metric}
          `,
          sql`
            SELECT population_id, gender, component, label, threshold
            FROM norm_thresholds
            WHERE metric_key = ${metric}
          `,
        ]);
        const applied = applyLeaderboardZones({
          rows: leaderboardRows,
          memberships: (memResult.rows as AttachZonesMembership[]).map((m) => ({
            athlete_id: m.athlete_id,
            hugo_group: m.hugo_group,
            is_primary: Boolean(m.is_primary),
          })),
          defaults: defResult.rows as AttachZonesDefault[],
          thresholds: mapThresholdRows(thrResult.rows as RawThresholdRow[]),
          populations,
          metricKey: metric,
          component,
          lowerIsBetter: sortAsc,
          overridePopulationId: parsedPopulation.populationId,
        });
        zonedRows = applied.rows.map(forPublicLeaderboard);
      } catch (err) {
        console.error("GET /api/leaderboard zones:", err);
      }
    }

    const payload = {
      data: {
        rows: zonedRows,
        metric_display_name: metricDef.display_name ?? metric,
        units: effectiveUnits,
        sort_asc: sortAsc,
        populations,
        selected_population_id: parsedPopulation.populationId,
      },
    };

    if (group_by === "gender") {
      const male = zonedRows.filter((r) => r.gender?.toLowerCase() === "m" || r.gender?.toLowerCase() === "male");
      const female = zonedRows.filter((r) => r.gender?.toLowerCase() === "f" || r.gender?.toLowerCase() === "female");
      return NextResponse.json({
        ...payload,
        data: {
          ...payload.data,
          male,
          female,
          rows: zonedRows,
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
