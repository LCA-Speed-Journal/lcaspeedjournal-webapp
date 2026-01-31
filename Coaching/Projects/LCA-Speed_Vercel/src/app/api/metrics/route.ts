/**
 * Metrics registry API - GET (public).
 * Returns all metric keys and display info for historical/progression filters.
 */
import { NextResponse } from "next/server";
import { getMetricsRegistry } from "@/lib/parser";

export async function GET() {
  try {
    const registry = getMetricsRegistry();
    const metrics = Object.entries(registry).map(([key, def]) => ({
      key,
      display_name: def.display_name ?? key,
      display_units: def.display_units ?? "",
    }));
    return NextResponse.json({ data: { metrics } });
  } catch (err) {
    console.error("GET /api/metrics:", err);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
