/**
 * Athlete metrics-with-data API - GET (public).
 * Returns distinct metrics this athlete has entries for, with category and display_name from registry.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getMaxVelocityKey, hasVelocityMetrics } from "@/lib/velocity-metrics";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    const { rows } = await sql`
      SELECT DISTINCT metric_key
      FROM entries
      WHERE athlete_id = ${athleteId}
      ORDER BY metric_key ASC
    `;

    const registry = getMetricsRegistry();
    const result: { metric_key: string; category: string; display_name: string }[] = (
      rows as { metric_key: string }[]
    ).map((r) => {
      const def = registry[r.metric_key];
      return {
        metric_key: r.metric_key,
        category: def?.category ?? "Other",
        display_name: def?.display_name ?? r.metric_key,
      };
    });

    if (hasVelocityMetrics()) {
      const maxVelKey = getMaxVelocityKey();
      const hasAnyMph = (rows as { metric_key: string }[]).some((r) =>
        registry[r.metric_key]?.display_units === "mph"
      );
      if (hasAnyMph && !result.some((m) => m.metric_key === maxVelKey)) {
        result.push({
          metric_key: maxVelKey,
          category: "Speed",
          display_name: "Max Velocity",
        });
      }
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("GET /api/athletes/[id]/metrics-with-data:", err);
    return NextResponse.json(
      { error: "Failed to fetch metrics with data" },
      { status: 500 }
    );
  }
}
