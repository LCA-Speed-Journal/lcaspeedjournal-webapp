/**
 * Metrics API - GET (public).
 * Returns list of metrics from registry; includes synthetic Max Velocity when mph metrics exist.
 */
import { NextResponse } from "next/server";
import { getMetricsRegistry } from "@/lib/parser";
import { getMaxVelocityKey, hasVelocityMetrics } from "@/lib/velocity-metrics";

export async function GET() {
  try {
    const registry = getMetricsRegistry();
    const metrics = Object.entries(registry).map(([key, d]) => ({
      key,
      display_name: d.display_name ?? key,
      display_units: d.display_units ?? "",
    }));

    if (hasVelocityMetrics()) {
      metrics.push({
        key: getMaxVelocityKey(),
        display_name: "Max Velocity",
        display_units: "mph",
      });
    }

    return NextResponse.json({
      data: { metrics },
    });
  } catch (err) {
    console.error("GET /api/metrics:", err);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
