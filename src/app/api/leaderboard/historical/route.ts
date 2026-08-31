/**
 * Historical leaderboard API - GET (public).
 * Returns ranked rows for a date range + metric; optional group_by=gender.
 * Supports metric=MaxVelocity (max display_value across all mph-metric entries in range).
 * Zones are current-stick only (computed at read time from live cuts, never stored).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getVelocityMetricKeys, getMaxVelocityKey } from "@/lib/velocity-metrics";
import { getHistoricalComponentFilter } from "@/lib/historical-metric-filter";
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

function splitByGender(rows: LeaderboardRow[]) {
  const male = rows.filter(
    (r) => r.gender?.toLowerCase() === "m" || r.gender?.toLowerCase() === "male"
  );
  const female = rows.filter(
    (r) => r.gender?.toLowerCase() === "f" || r.gender?.toLowerCase() === "female"
  );
  return { male, female };
}

async function attachCurrentStickZones<T extends LeaderboardRow>(opts: {
  rows: T[];
  populationsPromise: Promise<{ rows: unknown[] } | null>;
  metricKey: string;
  component: string | null;
  lowerIsBetter: boolean;
  parsedPopulationId: string | null;
}): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      rows: T[];
      populations: AttachZonesPopulation[];
      selected_population_id: string | null;
    }
> {
  let populations: AttachZonesPopulation[] = [];
  let populationsLoaded = false;
  const popResult = await opts.populationsPromise;
  if (popResult != null) {
    populations = popResult.rows as AttachZonesPopulation[];
    populationsLoaded = true;
    const resolved = resolveSelectedPopulation(
      opts.parsedPopulationId,
      populations
    );
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
  }

  let zonedRows: T[] = opts.rows;
  if (populationsLoaded) {
    try {
      const athleteIds = opts.rows.map((r) => r.athlete_id);
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
          WHERE metric_key = ${opts.metricKey}
        `,
        sql`
          SELECT population_id, gender, component, label, threshold
          FROM norm_thresholds
          WHERE metric_key = ${opts.metricKey}
        `,
      ]);
      const applied = applyLeaderboardZones({
        rows: opts.rows,
        memberships: (memResult.rows as AttachZonesMembership[]).map((m) => ({
          athlete_id: m.athlete_id,
          hugo_group: m.hugo_group,
          is_primary: Boolean(m.is_primary),
        })),
        defaults: defResult.rows as AttachZonesDefault[],
        thresholds: mapThresholdRows(thrResult.rows as RawThresholdRow[]),
        populations,
        metricKey: opts.metricKey,
        component: opts.component,
        lowerIsBetter: opts.lowerIsBetter,
        overridePopulationId: opts.parsedPopulationId,
      });
      zonedRows = applied.rows;
    } catch (err) {
      console.error("GET /api/leaderboard/historical zones:", err);
    }
  }

  return {
    ok: true,
    rows: zonedRows,
    populations,
    selected_population_id: opts.parsedPopulationId,
  };
}

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

    const parsedPopulation = parsePopulationIdParam(
      searchParams.get("population_id")
    );
    if (!parsedPopulation.ok) {
      return NextResponse.json(
        { error: parsedPopulation.error },
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
      console.error("GET /api/leaderboard/historical populations:", err);
      return null;
    });

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

      const zoned = await attachCurrentStickZones({
        rows: leaderboardRows,
        populationsPromise,
        metricKey: metric,
        component: null,
        lowerIsBetter: false,
        parsedPopulationId: parsedPopulation.populationId,
      });
      if (!zoned.ok) {
        return NextResponse.json({ error: zoned.error }, { status: 400 });
      }
      const { male, female } = splitByGender(zoned.rows);

      return NextResponse.json({
        data: {
          rows: zoned.rows,
          male,
          female,
          units: "mph",
          metric_display_name: "Max Velocity",
          populations: zoned.populations,
          selected_population_id: zoned.selected_population_id,
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
    const filter = getHistoricalComponentFilter(metric);

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
          AND (
            ${filter.primary}::text IS NULL
            OR e.component = ${filter.primary}
            OR (${filter.allowNullComponent} AND e.component IS NULL)
          )
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
          AND (
            ${filter.primary}::text IS NULL
            OR e.component = ${filter.primary}
            OR (${filter.allowNullComponent} AND e.component IS NULL)
          )
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

    const zoned = await attachCurrentStickZones({
      rows: leaderboardRows,
      populationsPromise,
      metricKey: metric,
      component: filter.primary,
      lowerIsBetter: sortAsc,
      parsedPopulationId: parsedPopulation.populationId,
    });
    if (!zoned.ok) {
      return NextResponse.json({ error: zoned.error }, { status: 400 });
    }
    const { male, female } = splitByGender(zoned.rows);

    return NextResponse.json({
      data: {
        rows: zoned.rows,
        male,
        female,
        units: metricDef.display_units ?? "",
        metric_display_name: metricDef.display_name ?? metric,
        populations: zoned.populations,
        selected_population_id: zoned.selected_population_id,
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
