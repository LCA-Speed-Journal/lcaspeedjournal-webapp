import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import {
  applyLeaderboardZones,
  mapThresholdRows,
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
  type TestingDayBoardData,
  type TestingDayMatrixColumn,
} from "@/lib/norms/testing-day";
import { mergeDerivedSprintColumns } from "@/lib/norms/testing-day-derived";
import { scoreTestingDayMatrix } from "@/lib/norms/testing-day-rank";
import { attachF2fToAthletes } from "@/lib/norms/f2f/board";
import { coerceThemeNotes } from "@/lib/norms/f2f/theme-notes";
import type { F2fEntry } from "@/lib/norms/f2f/types";
import { stampGraduatingClass } from "@/lib/norms/testing-day-pdf-layout";
import {
  TWENTY_YD_DASH,
  TWENTY_YD_PRIMARY_COMPONENT,
} from "@/lib/norms/editor-metrics";
import { getMaxVelocityKey } from "@/lib/velocity-metrics";

type BoardEntryRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  graduating_class: number | null;
  metric_key: string;
  component: string | null;
  interval_index: number | null;
  display_value: string | number;
  units: string | null;
};

type ThresholdWithMetric = RawThresholdRow & { metric_key: string };

function sessionDateString(raw: string | Date): string {
  if (typeof raw === "string") return raw.slice(0, 10);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

function isMissingF2fThemeNotesColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = String(e?.message ?? "").toLowerCase();
  return e?.code === "42703" || msg.includes("f2f_theme_notes");
}

export type BuildTestingDayBoardResult =
  | { ok: true; data: TestingDayBoardData }
  | { ok: false; status: number; error: string };

export async function buildTestingDayBoard(
  session_id: string,
  populationId: string | null
): Promise<BuildTestingDayBoardResult> {
  const registry = getMetricsRegistry();

  const sessionPromise = sql`
      SELECT id, session_date, phase, f2f_theme_notes
      FROM sessions
      WHERE id = ${session_id}
      LIMIT 1
    `.catch(async (err: unknown) => {
    if (!isMissingF2fThemeNotesColumn(err)) throw err;
    const fallback = await sql`
      SELECT id, session_date, phase
      FROM sessions
      WHERE id = ${session_id}
      LIMIT 1
    `;
    return {
      rows: fallback.rows.map((row) => ({
        ...(row as Record<string, unknown>),
        f2f_theme_notes: {},
      })),
    };
  });

  const [sessionRows, popResult, entryResult] = await Promise.all([
    sessionPromise,
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
        a.graduating_class,
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
    return { ok: false, status: 404, error: "Session not found" };
  }

  const sessionRow = sessionRows.rows[0] as {
    id: string;
    session_date: string | Date;
    phase: string | null;
    f2f_theme_notes?: unknown;
  };
  const noteOverrides = coerceThemeNotes(sessionRow.f2f_theme_notes);
  const populations = popResult.rows as AttachZonesPopulation[];
  const resolved = resolveSelectedPopulation(populationId, populations);
  if (!resolved.ok) {
    return { ok: false, status: 400, error: resolved.error };
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
    selected_population_id: populationId,
    matrix: { columns: [], athletes: [] },
    tests: [],
  };

  if (metricKeys.length === 0) {
    return { ok: true, data: empty };
  }

  const athleteIds = Array.from(new Set(rawEntries.map((row) => row.athlete_id)));
  const queryMetricKeys = Array.from(
    new Set([...metricKeys, TWENTY_YD_DASH, getMaxVelocityKey()])
  );
  const [memResult, defResult, thrResult] = await Promise.all([
    sql`
      SELECT athlete_id, hugo_group, is_primary
      FROM athlete_hugo_memberships
      WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
    `,
    sql`
      SELECT hugo_group, metric_key, population_id
      FROM norm_sport_defaults
      WHERE metric_key = ANY(${queryMetricKeys as unknown as string}::text[])
    `,
    sql`
      SELECT population_id, metric_key, gender, component, label, threshold
      FROM norm_thresholds
      WHERE metric_key = ANY(${queryMetricKeys as unknown as string}::text[])
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
      entryMatchesTestingDayComponent(row, component, metricKey)
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
      overridePopulationId: populationId,
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
        overridePopulationId: populationId,
      }),
    });
  }

  const mappedEntries = rawEntries.map((row) => ({
    athlete_id: row.athlete_id,
    first_name: row.first_name,
    last_name: row.last_name,
    gender: row.gender,
    metric_key: row.metric_key,
    component: row.component,
    display_value: Number(row.display_value),
  }));
  const merged = mergeDerivedSprintColumns({
    columns,
    hitsByColumn,
    rawEntries: mappedEntries,
  });
  const boardColumns = merged.columns;
  let boardHits = merged.hitsByColumn;

  const upsertTest = (column: TestingDayMatrixColumn) => {
    const entry = {
      column_key: column.key,
      metric: column.metric_key,
      metric_display_name: column.display_name,
      component: column.component,
      units: column.units,
      groups: summarizeTestingDay({
        rows: boardHits[column.key] ?? [],
        memberships,
        defaults,
        metricKey: column.metric_key,
        overridePopulationId: populationId,
      }),
    };
    const idx = tests.findIndex(
      (t) => t.column_key === column.key || t.metric === column.metric_key
    );
    if (idx >= 0) tests[idx] = entry;
    else tests.push(entry);
  };

  const twentyCol = boardColumns.find((c) => c.metric_key === TWENTY_YD_DASH);
  if (twentyCol) {
    boardHits = {
      ...boardHits,
      [twentyCol.key]: applyLeaderboardZones({
        rows: boardHits[twentyCol.key] ?? [],
        memberships,
        defaults,
        thresholds: mapThresholdRows(
          thresholdRows.filter((row) => row.metric_key === TWENTY_YD_DASH)
        ),
        populations,
        metricKey: TWENTY_YD_DASH,
        component: TWENTY_YD_PRIMARY_COMPONENT,
        lowerIsBetter: true,
        overridePopulationId: populationId,
      }).rows,
    };
    upsertTest(twentyCol);
  }

  const maxVKey = getMaxVelocityKey();
  const maxVCol = boardColumns.find((c) => c.metric_key === maxVKey);
  if (maxVCol) {
    boardHits = {
      ...boardHits,
      [maxVCol.key]: applyLeaderboardZones({
        rows: boardHits[maxVCol.key] ?? [],
        memberships,
        defaults,
        thresholds: mapThresholdRows(
          thresholdRows.filter((row) => row.metric_key === maxVKey)
        ),
        populations,
        metricKey: maxVKey,
        component: null,
        lowerIsBetter: false,
        overridePopulationId: populationId,
      }).rows,
    };
    upsertTest(maxVCol);
  }

  const data: TestingDayBoardData = {
    session_id,
    session_date: sessionDateString(sessionRow.session_date),
    phase: sessionRow.phase,
    selected_population_id: populationId,
    matrix: scoreTestingDayMatrix(
      buildTestingDayMatrix({
        columns: boardColumns,
        hitsByColumn: boardHits,
        memberships,
      })
    ),
    tests,
  };

  try {
    const entriesByAthlete = new Map<string, F2fEntry[]>();
    for (const row of rawEntries) {
      const list = entriesByAthlete.get(row.athlete_id) ?? [];
      list.push({
        metric_key: row.metric_key,
        component: row.component,
        display_value: Number(row.display_value),
      });
      entriesByAthlete.set(row.athlete_id, list);
    }
    const attached = attachF2fToAthletes(data.matrix.athletes, entriesByAthlete, {
      noteOverrides,
    });
    data.matrix = { ...data.matrix, athletes: attached.athletes };
    data.f2f_themes = attached.f2f_themes;
  } catch {
    // Omit f2f / f2f_themes; scored board still returns.
  }

  const classByAthlete = new Map<string, number | null>();
  for (const row of rawEntries) {
    if (!classByAthlete.has(row.athlete_id)) {
      classByAthlete.set(row.athlete_id, row.graduating_class ?? null);
    }
  }
  data.matrix = {
    ...data.matrix,
    athletes: stampGraduatingClass(data.matrix.athletes, classByAthlete),
  };

  return { ok: true, data };
}
