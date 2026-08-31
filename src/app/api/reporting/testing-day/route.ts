/**
 * Testing-day summary — GET (coach PIN).
 * Groups session marks by primary Hugo sport then gender, with live-stick zones.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { requireCoachSession } from "@/lib/require-coach";
import {
  applyLeaderboardZones,
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
import {
  summarizeTestingDay,
  testingDayComponentParam,
  type TestingDayHit,
  type TestingDaySummaryData,
} from "@/lib/norms/testing-day";

function sessionDateString(raw: string | Date): string {
  if (typeof raw === "string") return raw.slice(0, 10);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");
    const metric = searchParams.get("metric");
    const component = testingDayComponentParam(searchParams.get("component"));
    const overallOnly = component == null;

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

    const populationsPromise = sql`
      SELECT id, name
      FROM norm_populations
      WHERE archived_at IS NULL
      ORDER BY name ASC
    `;
    const sessionPromise = sql`
      SELECT id, session_date, phase
      FROM sessions
      WHERE id = ${session_id}
      LIMIT 1
    `;

    const [sessionRows, popResult] = await Promise.all([
      sessionPromise,
      populationsPromise,
    ]);
    if (!sessionRows.rows.length) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const sessionRow = sessionRows.rows[0] as {
      id: string;
      session_date: string | Date;
      phase: string | null;
    };
    const populations = popResult.rows as AttachZonesPopulation[];
    const resolved = resolveSelectedPopulation(
      parsedPopulation.populationId,
      populations
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    let effectiveUnits = metricDef.display_units ?? "";
    const unitsProbe = await sql`
      SELECT e.units
      FROM entries e
      WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
        AND (
          (${overallOnly}::boolean = true AND e.interval_index IS NULL AND e.component IS NULL)
          OR (
            ${overallOnly}::boolean = false
            AND e.component = ${component}
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
    const sortAsc = effectiveUnits.toLowerCase() === "s";

    type EntryRow = {
      athlete_id: string;
      first_name: string;
      last_name: string;
      gender: string | null;
      display_value: number;
    };

    const entryResult = sortAsc
      ? await sql`
          SELECT DISTINCT ON (e.athlete_id)
            e.athlete_id,
            a.first_name,
            a.last_name,
            a.gender,
            e.display_value
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
            AND (
              (${overallOnly}::boolean = true AND e.interval_index IS NULL AND e.component IS NULL)
              OR (
                ${overallOnly}::boolean = false
                AND e.component = ${component}
              )
            )
          ORDER BY e.athlete_id, e.display_value ASC
        `
      : await sql`
          SELECT DISTINCT ON (e.athlete_id)
            e.athlete_id,
            a.first_name,
            a.last_name,
            a.gender,
            e.display_value
          FROM entries e
          INNER JOIN athletes a ON a.id = e.athlete_id
          WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
            AND (
              (${overallOnly}::boolean = true AND e.interval_index IS NULL AND e.component IS NULL)
              OR (
                ${overallOnly}::boolean = false
                AND e.component = ${component}
              )
            )
          ORDER BY e.athlete_id, e.display_value DESC
        `;

    const entryRows = (entryResult.rows as EntryRow[]).map((row) => ({
      ...row,
      display_value: Number(row.display_value),
    }));

    let zonedHits: TestingDayHit[] = entryRows;
    let memberships: AttachZonesMembership[] = [];
    let defaults: AttachZonesDefault[] = [];

    if (entryRows.length > 0) {
      const athleteIds = entryRows.map((r) => r.athlete_id);
      const [memResult, defResult, thrResult] = await Promise.all([
        sql`
          SELECT athlete_id, hugo_group, is_primary
          FROM athlete_hugo_memberships
          WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
        `,
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
      memberships = (memResult.rows as AttachZonesMembership[]).map((m) => ({
        athlete_id: m.athlete_id,
        hugo_group: m.hugo_group,
        is_primary: Boolean(m.is_primary),
      }));
      defaults = defResult.rows as AttachZonesDefault[];
      const applied = applyLeaderboardZones({
        rows: entryRows,
        memberships,
        defaults,
        thresholds: mapThresholdRows(thrResult.rows as RawThresholdRow[]),
        populations,
        metricKey: metric,
        component,
        lowerIsBetter: sortAsc,
        overridePopulationId: parsedPopulation.populationId,
      });
      zonedHits = applied.rows;
    }

    const groups = summarizeTestingDay({
      rows: zonedHits,
      memberships,
      defaults,
      metricKey: metric,
      overridePopulationId: parsedPopulation.populationId,
    });

    const data: TestingDaySummaryData = {
      session_id,
      session_date: sessionDateString(sessionRow.session_date),
      phase: sessionRow.phase,
      metric,
      metric_display_name: metricDef.display_name ?? metric,
      component,
      units: effectiveUnits,
      selected_population_id: parsedPopulation.populationId,
      groups,
    };

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/reporting/testing-day:", err);
    return NextResponse.json(
      { error: "Failed to fetch testing-day summary" },
      { status: 500 }
    );
  }
}
