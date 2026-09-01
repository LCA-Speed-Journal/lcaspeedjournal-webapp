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
  resolveTestingDayComponent,
  sortTestingDayMetricKeys,
  entryMatchesTestingDayComponent,
  pickBestTestingDayHits,
  testingDayColumnKey,
  buildTestingDayMatrix,
  type TestingDayHit,
  type TestingDaySummaryData,
  type TestingDayBoardData,
  type TestingDayMatrixColumn,
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
    const rawComponent = searchParams.get("component");

    if (!session_id) {
      return NextResponse.json(
        { error: "Missing required query params: session_id" },
        { status: 400 }
      );
    }

    if (!metric) {
      return getTestingDayBoard(request, session_id);
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

    const component = resolveTestingDayComponent(metric, rawComponent);
    const overallOnly = component == null;

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

type BoardEntryRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  metric_key: string;
  component: string | null;
  interval_index: number | null;
  display_value: string | number;
  units: string | null;
};

type ThresholdWithMetric = RawThresholdRow & { metric_key: string };

async function getTestingDayBoard(request: NextRequest, session_id: string) {
  const { searchParams } = new URL(request.url);
  const parsedPopulation = parsePopulationIdParam(searchParams.get("population_id"));
  if (!parsedPopulation.ok) {
    return NextResponse.json(
      { error: parsedPopulation.error },
      { status: 400 }
    );
  }

  const registry = getMetricsRegistry();

  const [sessionRows, popResult, entryResult] = await Promise.all([
    sql`
      SELECT id, session_date, phase
      FROM sessions
      WHERE id = ${session_id}
      LIMIT 1
    `,
    sql`
      SELECT id, name
      FROM norm_populations
      WHERE archived_at IS NULL
      ORDER BY name ASC
    `,
    sql`
      SELECT
        e.athlete_id,
        a.first_name,
        a.last_name,
        a.gender,
        e.metric_key,
        e.component,
        e.interval_index,
        e.display_value,
        e.units
      FROM entries e
      INNER JOIN athletes a ON a.id = e.athlete_id
      WHERE e.session_id = ${session_id}
    `,
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

  const rawEntries = entryResult.rows as BoardEntryRow[];
  const metricKeys = sortTestingDayMetricKeys(
    rawEntries
      .map((row) => row.metric_key)
      .filter((key) => Boolean(registry[key]))
  );

  const empty: TestingDayBoardData = {
    session_id,
    session_date: sessionDateString(sessionRow.session_date),
    phase: sessionRow.phase,
    selected_population_id: parsedPopulation.populationId,
    matrix: { columns: [], athletes: [] },
    tests: [],
  };

  if (metricKeys.length === 0) {
    return NextResponse.json({ data: empty });
  }

  const athleteIds = Array.from(new Set(rawEntries.map((row) => row.athlete_id)));
  const [memResult, defResult, thrResult] = await Promise.all([
    sql`
      SELECT athlete_id, hugo_group, is_primary
      FROM athlete_hugo_memberships
      WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
    `,
    sql`
      SELECT hugo_group, metric_key, population_id
      FROM norm_sport_defaults
      WHERE metric_key = ANY(${metricKeys as unknown as string}::text[])
    `,
    sql`
      SELECT population_id, metric_key, gender, component, label, threshold
      FROM norm_thresholds
      WHERE metric_key = ANY(${metricKeys as unknown as string}::text[])
    `,
  ]);

  const memberships = (memResult.rows as AttachZonesMembership[]).map((m) => ({
    athlete_id: m.athlete_id,
    hugo_group: m.hugo_group,
    is_primary: Boolean(m.is_primary),
  }));
  const defaults = defResult.rows as AttachZonesDefault[];
  const thresholdRows = thrResult.rows as ThresholdWithMetric[];

  const columns: TestingDayMatrixColumn[] = [];
  const hitsByColumn: Record<string, TestingDayHit[]> = {};
  const tests: TestingDayBoardData["tests"] = [];

  for (const metricKey of metricKeys) {
    const metricDef = registry[metricKey];
    if (!metricDef) continue;
    const component = resolveTestingDayComponent(metricKey, null);
    const matching = rawEntries.filter((row) =>
      row.metric_key === metricKey &&
      entryMatchesTestingDayComponent(row, component)
    );
    if (matching.length === 0) continue;

    let units = metricDef.display_units ?? "";
    const probed = matching.find(
      (row) => typeof row.units === "string" && row.units.trim() !== ""
    )?.units;
    if (typeof probed === "string" && probed.trim() !== "") {
      units = probed;
    }
    const lowerIsBetter = units.toLowerCase() === "s";
    const best = pickBestTestingDayHits(
      matching.map((row) => ({
        athlete_id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        gender: row.gender,
        display_value: Number(row.display_value),
      })),
      lowerIsBetter
    );

    const applied = applyLeaderboardZones({
      rows: best,
      memberships,
      defaults,
      thresholds: mapThresholdRows(
        thresholdRows.filter((row) => row.metric_key === metricKey)
      ),
      populations,
      metricKey,
      component,
      lowerIsBetter,
      overridePopulationId: parsedPopulation.populationId,
    });

    const column: TestingDayMatrixColumn = {
      key: testingDayColumnKey(metricKey, component),
      metric_key: metricKey,
      display_name: metricDef.display_name ?? metricKey,
      component,
      units,
    };
    columns.push(column);
    hitsByColumn[column.key] = applied.rows;
    tests.push({
      column_key: column.key,
      metric: metricKey,
      metric_display_name: column.display_name,
      component,
      units,
      groups: summarizeTestingDay({
        rows: applied.rows,
        memberships,
        defaults,
        metricKey,
        overridePopulationId: parsedPopulation.populationId,
      }),
    });
  }

  const data: TestingDayBoardData = {
    session_id,
    session_date: sessionDateString(sessionRow.session_date),
    phase: sessionRow.phase,
    selected_population_id: parsedPopulation.populationId,
    matrix: buildTestingDayMatrix({ columns, hitsByColumn, memberships }),
    tests,
  };

  return NextResponse.json({ data });
}
