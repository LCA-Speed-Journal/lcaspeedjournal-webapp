/**
 * Athlete dashboard progression bundle: GET (public).
 * Primary-sport test series + squat/press/hinge in a date window.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { athleteLiftSeries } from "@/lib/athletes/lift-series";
import { isPrimaryResultComponent } from "@/lib/metric-utils";
import { metricLabel } from "@/lib/norms/editor-metrics";
import { getMetricsRegistry } from "@/lib/parser";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { displayedTestKeys } from "@/lib/team-progress/headlines";
import {
  getMaxVelocityKey,
  getVelocityMetricKeys,
} from "@/lib/velocity-metrics";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { attachHugoGroupsFromDb } from "@/lib/weight-room/hugo-memberships";
import { isUuid, serializeDate } from "@/lib/weight-room/insert-template";
import type { ProgressionPoint } from "@/types";

type EntryRow = {
  session_date: string;
  metric_key: string;
  component: string | null;
  display_value: number;
  units: string | null;
};

function lowerIsBetter(metricKey: string, units: string | null): boolean {
  if (metricKey === getMaxVelocityKey()) return false;
  if ((units ?? "").toLowerCase() === "s") return true;
  const reg = getMetricsRegistry()[metricKey];
  return (reg?.display_units ?? "").toLowerCase() === "s";
}

function seriesForMetric(
  rows: EntryRow[],
  metricKey: string
): { units: string; points: ProgressionPoint[] } {
  const velocityKeys = new Set(getVelocityMetricKeys());
  const maxVelKey = getMaxVelocityKey();
  const isMaxVel = metricKey === maxVelKey;
  const matching = rows.filter((r) => {
    if (isMaxVel) return velocityKeys.has(r.metric_key);
    if (r.metric_key !== metricKey) return false;
    return isPrimaryResultComponent(metricKey, r.component);
  });

  const sample = matching[0];
  const units = isMaxVel
    ? "mph"
    : (sample?.units ?? getMetricsRegistry()[metricKey]?.display_units ?? "");
  const lib = lowerIsBetter(metricKey, units);

  const bestByDate = new Map<string, number>();
  for (const row of matching) {
    if (!Number.isFinite(row.display_value)) continue;
    const prev = bestByDate.get(row.session_date);
    if (
      prev == null ||
      (lib ? row.display_value < prev : row.display_value > prev)
    ) {
      bestByDate.set(row.session_date, row.display_value);
    }
  }

  const points: ProgressionPoint[] = [...bestByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([session_date, display_value]) => ({
      session_date,
      display_value,
      units,
    }));

  return { units, points };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  if (!isUuid(athleteId)) {
    return NextResponse.json({ error: "Invalid athlete_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseReportingDateRange({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const { from, to } = parsed;

  try {
    const { rows: athleteRows } = await sql`
      SELECT id::text AS id, hugo_group
      FROM athletes
      WHERE id = ${athleteId}::uuid
      LIMIT 1
    `;
    const athlete = athleteRows[0] as
      | { id: string; hugo_group: string | null }
      | undefined;
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }

    const [withGroups] = await attachHugoGroupsFromDb([athlete]);
    const primaryRaw =
      withGroups.hugo_primary ??
      withGroups.hugo_groups[0] ??
      athlete.hugo_group ??
      "extracurricular";
    const primary = isHugoGroup(primaryRaw) ? primaryRaw : "extracurricular";

    const { rows: entryRows } = await sql`
      SELECT
        s.session_date,
        e.metric_key,
        e.component,
        e.display_value,
        e.units
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      WHERE e.athlete_id = ${athleteId}::uuid
        AND s.session_date >= ${from}::date
        AND s.session_date <= ${to}::date
        AND e.display_value IS NOT NULL
    `;
    const entries: EntryRow[] = (
      entryRows as Record<string, unknown>[]
    ).map((r) => ({
      session_date: serializeDate(r.session_date),
      metric_key: String(r.metric_key),
      component: r.component == null ? null : String(r.component),
      display_value: Number(r.display_value),
      units: r.units == null ? null : String(r.units),
    }));

    const has40 = entries.some(
      (r) => r.metric_key === "40yd_Dash" && r.component === "0-40yd"
    );
    const has20 = entries.some(
      (r) => r.metric_key === "20yd_Dash" && r.component === "0-20yd"
    );
    const metricKeys = displayedTestKeys(primary).flatMap((k) => {
      if (k === "40yd_Dash" && !has40 && has20) return ["20yd_Dash"];
      return [k];
    });

    const tests = metricKeys
      .map((metric_key) => {
        const { units, points } = seriesForMetric(entries, metric_key);
        if (points.length === 0) return null;
        return {
          metric_key,
          display_name: metricLabel(metric_key),
          units,
          points,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t != null);

    const { rows: liftRows } = await sql`
      SELECT
        l.session_date,
        m.name AS movement_name,
        r.kind,
        r.load
      FROM session_logs l
      INNER JOIN set_results r ON r.session_log_id = l.id
      INNER JOIN workout_movements m ON m.id = r.movement_id
      WHERE l.athlete_id = ${athleteId}::uuid
        AND l.session_date >= ${from}::date
        AND l.session_date <= ${to}::date
    `;
    const lifts = athleteLiftSeries(
      (liftRows as Record<string, unknown>[]).map((r) => ({
        session_date: serializeDate(r.session_date),
        movement_name: String(r.movement_name ?? ""),
        kind: r.kind == null ? null : String(r.kind),
        load: r.load == null ? null : Number(r.load),
      }))
    ).map((s) => ({
      lift_id: s.lift_id,
      label: s.label,
      units: s.units,
      points: s.points.map((p) => ({
        session_date: p.date,
        display_value: p.value,
      })),
    }));

    return NextResponse.json({
      data: {
        from,
        to,
        hugo_primary: withGroups.hugo_primary,
        tests,
        lifts,
      },
    });
  } catch (err) {
    console.error("GET /api/athletes/[id]/dashboard-progression:", err);
    return NextResponse.json(
      { error: "Failed to fetch dashboard progression" },
      { status: 500 }
    );
  }
}
