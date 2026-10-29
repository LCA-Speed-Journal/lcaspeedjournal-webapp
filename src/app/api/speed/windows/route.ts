/**
 * Distinct acceleration and build-in windows in a historical date range.
 * GET ?from=&to= returns { accelerations, build_ins }.
 * Spanning build-ins are omitted. Missing speed-window columns (Postgres 42703) return empty lists.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { spanningBuildInKeys, windowIdentity, type SpeedWindowRow } from "@/lib/speed/adjacent";
import { parseWindowDateRange } from "@/lib/speed/window-range";
import { ACCELERATION_KEY, BUILD_IN_KEY, type DistanceUnit } from "@/lib/speed/windows";

const COMPONENT_SORT = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(m|yd)$/;

function isUndefinedColumn(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const rec = current as { code?: string; cause?: unknown };
    if (rec.code === "42703") return true;
    current = rec.cause;
  }
  return false;
}

function compareComponents(a: string, b: string): number {
  const left = COMPONENT_SORT.exec(a);
  const right = COMPONENT_SORT.exec(b);
  if (!left || !right) return a.localeCompare(b);
  const start = Number(left[1]) - Number(right[1]);
  if (start !== 0) return start;
  const end = Number(left[2]) - Number(right[2]);
  if (end !== 0) return end;
  return left[3].localeCompare(right[3]);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareComponents);
}

function toWindowRows(rows: Record<string, unknown>[]): SpeedWindowRow[] {
  const out: SpeedWindowRow[] = [];
  for (const row of rows) {
    const unit = row.distance_unit;
    if (unit !== "m" && unit !== "yd") continue;
    const start = Number(row.start_distance);
    const end = Number(row.end_distance);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (typeof row.component !== "string" || row.component.length === 0) continue;
    const metricKey = String(row.metric_key);
    if (metricKey !== ACCELERATION_KEY && metricKey !== BUILD_IN_KEY) continue;
    out.push({
      session_id: String(row.session_id),
      metric_key: metricKey,
      component: row.component,
      distance_unit: unit as DistanceUnit,
      start_distance: start,
      end_distance: end,
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const parsed = parseWindowDateRange({
    from: request.nextUrl.searchParams.get("from"),
    to: request.nextUrl.searchParams.get("to"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const result = await sql`
      SELECT e.session_id, e.metric_key, e.component, e.distance_unit, e.start_distance, e.end_distance
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      WHERE s.session_date >= ${parsed.from}::date
        AND s.session_date <= ${parsed.to}::date
        AND (e.metric_key = ${ACCELERATION_KEY} OR e.metric_key = ${BUILD_IN_KEY})
    `;
    const rows = toWindowRows(result.rows as Record<string, unknown>[]);
    const spanning = spanningBuildInKeys(rows);
    const accelerations: string[] = [];
    const buildIns: string[] = [];
    for (const row of rows) {
      if (spanning.has(windowIdentity(row))) continue;
      if (row.metric_key === ACCELERATION_KEY) accelerations.push(row.component);
      else buildIns.push(row.component);
    }
    return NextResponse.json({
      accelerations: uniqueSorted(accelerations),
      build_ins: uniqueSorted(buildIns),
    });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return NextResponse.json({ accelerations: [], build_ins: [] });
    }
    console.error("GET /api/speed/windows:", err);
    return NextResponse.json(
      { error: "Failed to load speed windows" },
      { status: 500 }
    );
  }
}
