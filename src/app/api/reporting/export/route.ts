/**
 * Reporting CSV export — GET (public).
 * Query: from, to (YYYY-MM-DD). Row cap returns 413 JSON (Payload Too Large).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { escapeCsvCell } from "@/lib/csv-escape";
import { MAX_EXPORT_ROWS } from "@/lib/reporting-constants";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { getMetricsRegistry } from "@/lib/parser";
import type {
  AttachZonesDefault,
  AttachZonesMembership,
  AttachZonesPopulation,
} from "@/lib/norms/attach-zones";
import {
  attachExportZones,
  mapExportThresholdRows,
  type ExportZoneCells,
  type RawExportThresholdRow,
} from "@/lib/norms/export-zones";

const SLOW_MS = 2000;

const CSV_HEADER = [
  "session_date",
  "session_id",
  "phase",
  "session_notes",
  "athlete_id",
  "first_name",
  "last_name",
  "gender",
  "graduating_class",
  "athlete_type",
  "metric_key",
  "metric_label",
  "interval_index",
  "component",
  "value",
  "display_value",
  "units",
  "raw_input",
  "entry_id",
  "created_at",
  "zone_label",
  "population_name",
].join(",");

type ExportRow = {
  session_date: string;
  session_id: string;
  phase: string;
  session_notes: string | null;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number | null;
  athlete_type: string;
  metric_key: string;
  interval_index: number | null;
  component: string | null;
  value: string | number;
  display_value: string | number;
  units: string;
  raw_input: string | null;
  entry_id: string;
  created_at: Date | string;
};

function formatCreatedAt(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = parseReportingDateRange({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { from, to } = parsed;

  const t0 = performance.now();
  try {
    const countResult = await sql`
      SELECT COUNT(*)::int AS c
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
    `;
    const count = Number((countResult.rows[0] as { c: number })?.c ?? 0);
    if (count > MAX_EXPORT_ROWS) {
      return NextResponse.json(
        {
          error: `Export exceeds maximum of ${MAX_EXPORT_ROWS} rows; narrow the date range.`,
        },
        { status: 413 }
      );
    }

    const { rows } = await sql`
      SELECT
        s.session_date::text AS session_date,
        s.id AS session_id,
        s.phase,
        s.session_notes,
        a.id AS athlete_id,
        a.first_name,
        a.last_name,
        a.gender,
        a.graduating_class,
        a.athlete_type,
        e.metric_key,
        e.interval_index,
        e.component,
        e.value,
        e.display_value,
        e.units,
        e.raw_input,
        e.id AS entry_id,
        e.created_at
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      INNER JOIN athletes a ON a.id = e.athlete_id
      WHERE s.session_date >= ${from}::date AND s.session_date <= ${to}::date
      ORDER BY
        s.session_date,
        a.last_name,
        a.first_name,
        e.metric_key,
        e.interval_index NULLS LAST,
        e.component NULLS LAST
    `;

    const elapsed = performance.now() - t0;
    if (elapsed > SLOW_MS) {
      console.warn(
        `[GET /api/reporting/export] slow query ${Math.round(elapsed)}ms from=${from} to=${to}`
      );
    }

    const registry = getMetricsRegistry();
    const exportRows = rows as ExportRow[];
    let zonedRows: Array<ExportRow & ExportZoneCells> = exportRows.map((r) => ({
      ...r,
      zone_label: "",
      population_name: "",
    }));

    if (exportRows.length > 0) {
      try {
        const athleteIds = [...new Set(exportRows.map((r) => r.athlete_id))];
        const [popResult, memResult, defResult, thrResult] = await Promise.all([
          sql`
            SELECT id, name
            FROM norm_populations
            WHERE archived_at IS NULL
            ORDER BY name ASC
          `,
          sql`
            SELECT athlete_id, hugo_group, is_primary
            FROM athlete_hugo_memberships
            WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
          `,
          sql`
            SELECT hugo_group, metric_key, population_id
            FROM norm_sport_defaults
          `,
          sql`
            SELECT population_id, metric_key, gender, component, label, threshold
            FROM norm_thresholds
          `,
        ]);
        zonedRows = attachExportZones({
          rows: exportRows,
          memberships: (memResult.rows as AttachZonesMembership[]).map((m) => ({
            athlete_id: m.athlete_id,
            hugo_group: m.hugo_group,
            is_primary: Boolean(m.is_primary),
          })),
          defaults: defResult.rows as AttachZonesDefault[],
          thresholds: mapExportThresholdRows(
            thrResult.rows as RawExportThresholdRow[]
          ),
          populations: popResult.rows as AttachZonesPopulation[],
          lowerIsBetterFor: (metricKey) =>
            (registry[metricKey]?.display_units ?? "").toLowerCase() === "s",
        });
      } catch (err) {
        console.error("GET /api/reporting/export zones:", err);
      }
    }

    const lines: string[] = [CSV_HEADER];
    for (const r of zonedRows) {
      const metricLabel = registry[r.metric_key]?.display_name ?? r.metric_key;
      lines.push(
        [
          escapeCsvCell(r.session_date),
          escapeCsvCell(r.session_id),
          escapeCsvCell(r.phase),
          escapeCsvCell(r.session_notes ?? ""),
          escapeCsvCell(r.athlete_id),
          escapeCsvCell(r.first_name),
          escapeCsvCell(r.last_name),
          escapeCsvCell(r.gender),
          escapeCsvCell(r.graduating_class ?? ""),
          escapeCsvCell(r.athlete_type),
          escapeCsvCell(r.metric_key),
          escapeCsvCell(metricLabel),
          escapeCsvCell(
            r.interval_index === null || r.interval_index === undefined
              ? ""
              : r.interval_index
          ),
          escapeCsvCell(r.component ?? ""),
          escapeCsvCell(r.value),
          escapeCsvCell(r.display_value),
          escapeCsvCell(r.units),
          escapeCsvCell(r.raw_input ?? ""),
          escapeCsvCell(r.entry_id),
          escapeCsvCell(formatCreatedAt(r.created_at)),
          escapeCsvCell(r.zone_label),
          escapeCsvCell(r.population_name),
        ].join(",")
      );
    }

    const csvBody = lines.join("\n");
    return new NextResponse(csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lcaspeed-export_${from}_${to}.csv"`,
      },
    });
  } catch (err) {
    console.error("GET /api/reporting/export:", err);
    return NextResponse.json({ error: "Failed to build export" }, { status: 500 });
  }
}
