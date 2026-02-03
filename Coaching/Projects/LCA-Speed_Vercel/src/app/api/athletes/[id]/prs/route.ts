/**
 * Athlete PRs API - GET (public).
 * Returns best value per metric for this athlete from entries.
 * Time metrics (display_units "s"): MIN. Others: MAX.
 * MaxVelocity: max of all mph-metric entries.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getMaxVelocityKey, getVelocityMetricKeys, hasVelocityMetrics } from "@/lib/velocity-metrics";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    const registry = getMetricsRegistry();
    const { rows } = await sql`
      SELECT metric_key, MIN(display_value) AS min_val, MAX(display_value) AS max_val, MAX(units) AS units
      FROM entries
      WHERE athlete_id = ${athleteId}
      GROUP BY metric_key
    `;

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

    for (const r of rows as { metric_key: string; min_val: string; max_val: string; units: string }[]) {
      const def = registry[r.metric_key];
      const units = (def?.display_units ?? r.units ?? "").toLowerCase();
      const lowerIsBetter = units === "s";
      const value = lowerIsBetter ? Number(r.min_val) : Number(r.max_val);
      const displayName = def?.display_name ?? r.metric_key;

      if (velocityKeys.includes(r.metric_key)) {
        const v = Number(r.max_val);
        if (maxVelocityValue === null || v > maxVelocityValue) maxVelocityValue = v;
      }

      result.push({
        metric_key: r.metric_key,
        display_name: displayName,
        units: def?.display_units ?? r.units ?? "",
        value,
        lower_is_better: lowerIsBetter,
      });
    }

    if (hasVelocityMetrics() && maxVelocityValue !== null && !result.some((m) => m.metric_key === maxVelKey)) {
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
