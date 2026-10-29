/**
 * Leaderboard API - GET (public).
 * Returns ranked rows for a session + metric; optional group_by=gender.
 * Includes optional session-to-session comparison (previous_display_value, percent_change, trend).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { attachDropoff, type DropoffAttempt } from "@/lib/dropoff/attach";
import { isOverallDropoffView } from "@/lib/dropoff/attempts";
import { directionFromUnits } from "@/lib/dropoff/summarize";
import { guestFields } from "@/lib/guest-athletes";
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

type LeaderboardWindow = {
  distance_unit: "m" | "yd";
  start_distance: number;
  end_distance: number;
};

type SqlParam = string | number | boolean | null;
type SqlPiece = string | { param: SqlParam };

function sqlParam(value: SqlParam): SqlPiece {
  return { param: value };
}

function isMissingSpeedWindowColumn(err: unknown): boolean {
  const messages: string[] = [];
  const codes: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const rec = current as { code?: string; message?: string; cause?: unknown };
    if (typeof rec.code === "string") codes.push(rec.code);
    if (typeof rec.message === "string") messages.push(rec.message);
    current = rec.cause;
  }
  if (codes.includes("42703")) return true;
  const msg = messages.join(" ").toLowerCase();
  if (!msg.includes("does not exist")) return false;
  return (
    msg.includes("distance_unit") ||
    msg.includes("start_distance") ||
    msg.includes("end_distance") ||
    msg.includes("legacy_metric_key") ||
    msg.includes("legacy_component")
  );
}

function parseLeaderboardWindow(searchParams: URLSearchParams): LeaderboardWindow | null {
  const unit = searchParams.get("distance_unit");
  const startRaw = searchParams.get("start_distance");
  const endRaw = searchParams.get("end_distance");
  if (unit == null || startRaw == null || endRaw == null) return null;
  if (unit === "" || startRaw.trim() === "" || endRaw.trim() === "") return null;
  if (unit !== "m" && unit !== "yd") return null;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { distance_unit: unit, start_distance: start, end_distance: end };
}

function viewFilterPieces(
  metric: string,
  overallOnly: boolean,
  intervalIndex: number | null,
  component: string | null
): SqlPiece[] {
  return [
    `(
      (
        `,
    sqlParam(overallOnly),
    `::boolean = true
        AND e.interval_index IS NULL
        AND (
          e.component IS NULL
          OR (
            `,
    sqlParam(metric),
    `::text = '5-10-5_Agility'
            AND e.component IN ('Average', 'Athlete-Comfort')
          )
        )
      )
      OR (
        `,
    sqlParam(overallOnly),
    `::boolean = false
        AND (`,
    sqlParam(intervalIndex),
    `::int IS NULL OR e.interval_index = `,
    sqlParam(intervalIndex),
    `)
        AND (`,
    sqlParam(component),
    `::text IS NULL OR e.component = `,
    sqlParam(component),
    `)
      )
    )`,
  ];
}

function windowMatchPieces(window: LeaderboardWindow): SqlPiece[] {
  return [
    ` AND e.distance_unit = `,
    sqlParam(window.distance_unit),
    ` AND e.start_distance = `,
    sqlParam(window.start_distance),
    ` AND e.end_distance = `,
    sqlParam(window.end_distance),
  ];
}

function entryMatchPieces(args: {
  metric: string;
  overallOnly: boolean;
  intervalIndex: number | null;
  component: string | null;
  window: LeaderboardWindow | null;
  useSpeedColumns: boolean;
  attemptForWindow: boolean;
}): SqlPiece[] {
  if (!args.useSpeedColumns) {
    return [
      `e.metric_key = `,
      sqlParam(args.metric),
      ` AND `,
      ...viewFilterPieces(args.metric, args.overallOnly, args.intervalIndex, args.component),
    ];
  }

  if (args.attemptForWindow && args.window) {
    return [
      `(e.metric_key = `,
      sqlParam(args.metric),
      ` OR e.legacy_metric_key = `,
      sqlParam(args.metric),
      `)
      AND e.interval_index IS NULL
      AND (
        `,
      sqlParam(args.component),
      `::text IS NULL
        OR e.component = `,
      sqlParam(args.component),
      ` OR e.legacy_component = `,
      sqlParam(args.component),
      `)`,
      ...windowMatchPieces(args.window),
    ];
  }

  return [
    `(
      (
        e.metric_key = `,
    sqlParam(args.metric),
    ` AND `,
    ...viewFilterPieces(args.metric, args.overallOnly, args.intervalIndex, args.component),
    `
      )
      OR (
        e.legacy_metric_key = `,
    sqlParam(args.metric),
    `
        AND e.interval_index IS NULL
        AND (
          `,
    sqlParam(args.component),
    `::text IS NULL
          OR e.component = `,
    sqlParam(args.component),
    `
          OR e.legacy_component = `,
    sqlParam(args.component),
    `
        )
      )
    )`,
    ...(args.window ? windowMatchPieces(args.window) : []),
  ];
}

async function queryRows<T>(pieces: SqlPiece[]): Promise<T[]> {
  const strings: string[] = [""];
  const values: SqlParam[] = [];
  for (const piece of pieces) {
    if (typeof piece === "string") {
      strings[strings.length - 1] += piece;
    } else {
      values.push(piece.param);
      strings.push("");
    }
  }
  const template = Object.assign([...strings], { raw: [...strings] }) as TemplateStringsArray;
  const result = await sql(template, ...values);
  return result.rows as T[];
}

function athleteIdFilter(athleteIds: string[]): SqlPiece[] {
  return [
    ` AND e.athlete_id = ANY(`,
    sqlParam(athleteIds as unknown as string),
    `::uuid[])`,
  ];
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
    const speedWindow = parseLeaderboardWindow(searchParams);
    let useSpeedColumns = true;
    const matchPieces = (attemptForWindow = false) =>
      entryMatchPieces({
        metric,
        overallOnly,
        intervalIndex: interval_index,
        component,
        window: speedWindow,
        useSpeedColumns,
        attemptForWindow,
      });
    // Determine effective units from filtered entries when possible; this lets
    // component-specific views (e.g., split-seconds under an mph metric key) sort correctly.
    let effectiveUnits = metricDef.display_units ?? "";
    const probeUnits = () =>
      queryRows<{ units?: string }>([
        `
          SELECT e.units
          FROM entries e
          WHERE e.session_id = `,
        sqlParam(session_id),
        ` AND `,
        ...matchPieces(false),
        ` LIMIT 1`,
      ]);
    let unitsProbe: { units?: string }[];
    try {
      unitsProbe = await probeUnits();
    } catch (err) {
      if (!isMissingSpeedWindowColumn(err)) throw err;
      useSpeedColumns = false;
      unitsProbe = await probeUnits();
    }
    if (unitsProbe.length > 0) {
      const probed = unitsProbe[0]?.units;
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
      context_hugo_group: string | null;
    };

    const bestDirection = sortAsc ? "ASC" : "DESC";
    const rows = await queryRows<Row>([
      `
        WITH best AS (
          SELECT DISTINCT ON (e.athlete_id)
            e.athlete_id,
            e.display_value,
            e.units,
            e.context_hugo_group,
            a.first_name,
            a.last_name,
            a.gender,
            a.athlete_type
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = `,
      sqlParam(session_id),
      ` AND `,
      ...matchPieces(false),
      `
          ORDER BY e.athlete_id, e.display_value `,
      bestDirection,
      `
        )
        SELECT
          (ROW_NUMBER() OVER (ORDER BY display_value `,
      bestDirection,
      `))::int AS rank,
          athlete_id,
          first_name,
          last_name,
          gender,
          athlete_type,
          display_value,
          units,
          context_hugo_group
        FROM best
        ORDER BY rank
      `,
    ]);

    // Previous-session best per athlete (most recent prior session, same metric+interval+component)
    type PrevRow = { athlete_id: string; previous_display_value: number; previous_session_date: string };
    const prevMap = new Map<string, { previous_display_value: number; previous_session_date: string }>();
    if (rows.length > 0) {
      const athleteIds = rows.map((r) => r.athlete_id);
      const prevResult = await queryRows<PrevRow>([
        `
            WITH current_session AS (SELECT id, session_date FROM sessions WHERE id = `,
        sqlParam(session_id),
        `),
            last_prior_session AS (
              SELECT e.athlete_id, MAX(s.session_date) AS prev_session_date
              FROM entries e
              JOIN sessions s ON s.id = e.session_id
              CROSS JOIN current_session cs
              WHERE s.session_date < cs.session_date
                AND `,
        ...matchPieces(false),
        ...athleteIdFilter(athleteIds),
        `
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
              WHERE `,
        ...matchPieces(false),
        `
              ORDER BY e.athlete_id, e.display_value `,
        bestDirection,
        `
            )
            SELECT athlete_id, previous_display_value, previous_session_date FROM prev_best
          `,
      ]);
      for (const p of prevResult) {
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
    const aggregateBest = (athleteIds: string[], seasonBounded: boolean) => {
      const agg = sortAsc ? "MIN" : "MAX";
      const pieces: SqlPiece[] = [
        `SELECT e.athlete_id, `,
        agg,
        `(e.display_value)::float AS best_value FROM entries e `,
      ];
      if (seasonBounded) {
        pieces.push(`JOIN sessions s ON s.id = e.session_id `);
      }
      pieces.push(`WHERE `, ...matchPieces(false), ...athleteIdFilter(athleteIds));
      if (seasonBounded) {
        pieces.push(
          ` AND s.session_date >= `,
          sqlParam(seasonStart),
          `::date AND s.session_date <= `,
          sqlParam(seasonEnd),
          `::date`
        );
      }
      pieces.push(` GROUP BY e.athlete_id`);
      return queryRows<BestRow>(pieces);
    };

    const allTimeBestMap = new Map<string, number>();
    if (rows.length > 0) {
      const athleteIds = rows.map((r) => r.athlete_id);
      const allTimeResult = await aggregateBest(athleteIds, false);
      for (const r of allTimeResult) {
        allTimeBestMap.set(r.athlete_id, Number(r.best_value));
      }
    }

    const seasonBestMap = new Map<string, number>();
    if (rows.length > 0 && seasonStart && seasonEnd) {
      const athleteIds = rows.map((r) => r.athlete_id);
      const seasonResult = await aggregateBest(athleteIds, true);
      for (const r of seasonResult) {
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

    const athleteIds = leaderboardRows.map((r) => r.athlete_id);
    type MembershipRow = {
      athlete_id: string;
      hugo_group: string;
      is_primary: boolean;
    };
    let memberships: AttachZonesMembership[] | null = null;
    try {
      const memResult =
        athleteIds.length > 0
          ? await sql`
              SELECT athlete_id, hugo_group, is_primary
              FROM athlete_hugo_memberships
              WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
            `
          : { rows: [] as MembershipRow[] };
      const membershipRows = memResult.rows as MembershipRow[];
      memberships = membershipRows.map((m) => ({
        athlete_id: m.athlete_id,
        hugo_group: m.hugo_group,
        is_primary: Boolean(m.is_primary),
      }));
      const groupsByAthlete = new Map<string, string[]>();
      for (const membership of membershipRows) {
        const groups = groupsByAthlete.get(membership.athlete_id);
        if (groups) {
          groups.push(membership.hugo_group);
        } else {
          groupsByAthlete.set(membership.athlete_id, [membership.hugo_group]);
        }
      }
      for (let i = 0; i < leaderboardRows.length; i++) {
        const fields = guestFields(
          rows[i]?.context_hugo_group,
          groupsByAthlete.get(leaderboardRows[i].athlete_id) ?? []
        );
        leaderboardRows[i].guest = fields.guest;
        leaderboardRows[i].home_sport_label = fields.home_sport_label;
      }
    } catch (err) {
      console.error("GET /api/leaderboard memberships:", err);
    }

    let rowsForZones = leaderboardRows;
    const dropoffWindow = useSpeedColumns && speedWindow ? speedWindow : undefined;
    if (isOverallDropoffView(metric, component, interval_index, dropoffWindow) && leaderboardRows.length > 0) {
      const attemptRows = await queryRows<{
        athlete_id: string;
        id: string;
        display_value: number | string;
        created_at: string | Date;
      }>([
        `
          SELECT e.athlete_id, e.id, e.display_value, e.created_at
          FROM entries e
          WHERE e.session_id = `,
        sqlParam(session_id),
        ` AND `,
        ...matchPieces(dropoffWindow != null),
        ` ORDER BY e.created_at ASC, e.id ASC`,
      ]);
      const attempts: DropoffAttempt[] = attemptRows.map((row) => ({
        athleteId: row.athlete_id,
        id: row.id,
        displayValue: Number(row.display_value),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      }));
      rowsForZones = attachDropoff(
        leaderboardRows,
        attempts,
        directionFromUnits(effectiveUnits)
      );
    }

    let zonedRows: LeaderboardRow[] = rowsForZones;
    if (populationsLoaded && memberships) {
      try {
        const [defResult, thrResult] = await Promise.all([
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
          rows: rowsForZones,
          memberships,
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
