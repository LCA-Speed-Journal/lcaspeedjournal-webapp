/**
 * Athlete PRs API - GET (public).
 * Returns best value per metric for this athlete from entries.
 * Time metrics (display_units "s"): MIN. Others: MAX.
 * MaxVelocity: max of all mph-metric entries.
 *
 * For cumulative metrics with multiple components (e.g. 20m_Accel),
 * we restrict aggregation to the primary (full-run) component so the
 * PR reflects the full repetition, not a short segment.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getMaxVelocityKey, getVelocityMetricKeys, hasVelocityMetrics } from "@/lib/velocity-metrics";
import { getPrimaryComponent } from "@/lib/metric-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    const registry = getMetricsRegistry();

    const { rows: entryRows } = await sql`
      SELECT metric_key, component, display_value, units
      FROM entries
      WHERE athlete_id = ${athleteId}
    `;

    const byMetric = new Map<string, { display_value: number; units: string }[]>();

    for (const r of entryRows as {
      metric_key: string;
      component: string | null;
      display_value: number;
      units: string;
    }[]) {
      const primary = getPrimaryComponent(r.metric_key, registry);
      const keep =
        primary == null || r.component === primary || r.component == null;
      if (!keep) continue;

      const list = byMetric.get(r.metric_key) ?? [];
      list.push({
        display_value: Number(r.display_value),
        units: r.units,
      });
      byMetric.set(r.metric_key, list);
    }

    const result: {
      metric_key: string;
      display_name: string;
      units: string;
      value: number;
      lower_is_better: boolean;
    }[] = [];

    const velocityKeys = hasVelocityMetrics() ? getVelocityMetricKeys() : [];
    const maxVelKey = getMaxVelocityKey();
    let maxVelocityValue: number | null = null;

    for (const [metric_key, list] of byMetric) {
      if (list.length === 0) continue;
      const def = registry[metric_key];
      const units = (def?.display_units ?? list[0].units ?? "").toLowerCase();
      const lowerIsBetter = units === "s";
      const values = list.map((x) => x.display_value);
      const value = lowerIsBetter ? Math.min(...values) : Math.max(...values);

      if (velocityKeys.includes(metric_key)) {
        const v = Math.max(...values);
        if (maxVelocityValue === null || v > maxVelocityValue) {
          maxVelocityValue = v;
        }
      }

      result.push({
        metric_key,
        display_name: def?.display_name ?? metric_key,
        units: def?.display_units ?? list[0].units ?? "",
        value,
        lower_is_better: lowerIsBetter,
      });
    }

    if (
      hasVelocityMetrics() &&
      maxVelocityValue !== null &&
      !result.some((m) => m.metric_key === maxVelKey)
    ) {
      result.push({
        metric_key: maxVelKey,
        display_name: "Max Velocity",
        units: "mph",
        value: maxVelocityValue,
        lower_is_better: false,
      });
    }

    result.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("GET /api/athletes/[id]/prs:", err);
    return NextResponse.json(
      { error: "Failed to fetch PRs" },
      { status: 500 }
    );
  }
}
