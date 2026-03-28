/**
 * Session metrics API - GET (public).
 * Returns metrics (and their components/splits) that have entries for the given session.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";

export type SessionMetricComponent = {
  interval_index: number | null;
  component: string | null;
  label: string;
};

export type SessionMetric = {
  metric_id: string;
  metric_key: string;
  display_name: string;
  units: string;
  components: SessionMetricComponent[];
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");

    if (!session_id) {
      return NextResponse.json(
        { error: "Missing required query param: session_id" },
        { status: 400 }
      );
    }

    const sessionRows = await sql`
      SELECT id FROM sessions WHERE id = ${session_id} LIMIT 1
    `;
    if (!sessionRows.rows.length) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const { rows } = await sql`
      SELECT DISTINCT metric_key, units, interval_index, component
      FROM entries
      WHERE session_id = ${session_id}
      ORDER BY metric_key, units, interval_index NULLS LAST, component NULLS LAST
    `;

    const registry = getMetricsRegistry();
    const byMetricAndUnits = new Map<
      string,
      {
        metric_key: string;
        units: string;
        pairs: { interval_index: number | null; component: string | null }[];
      }
    >();

    for (const r of rows as { metric_key: string; units: string; interval_index: number | null; component: string | null }[]) {
      const key = `${r.metric_key}::${r.units}`;
      if (!byMetricAndUnits.has(key)) {
        byMetricAndUnits.set(key, {
          metric_key: r.metric_key,
          units: r.units,
          pairs: [],
        });
      }
      byMetricAndUnits.get(key)!.pairs.push({ interval_index: r.interval_index, component: r.component });
    }

    const metrics: SessionMetric[] = [];

    for (const [, group] of byMetricAndUnits) {
      const { metric_key, units, pairs } = group;
      const def = registry[metric_key];
      const display_name = def?.display_name ?? metric_key;
      const metric_id = `${metric_key}::${units}`;

      const seen = new Set<string>();
      const components: SessionMetricComponent[] = [];
      const hasOverall = pairs.some((p) => p.interval_index == null && p.component == null);
      if (hasOverall) {
        components.push({
          interval_index: null,
          component: null,
          label: "Overall",
        });
        seen.add("null_null");
      }

      for (const { interval_index, component } of pairs) {
        const key = `${interval_index ?? "n"}_${component ?? "n"}`;
        if (key === "n_n") continue;
        if (seen.has(key)) continue;
        seen.add(key);

        let label: string;
        if (component != null && component !== "") {
          label = component;
        } else if (interval_index != null) {
          label = `Split ${interval_index + 1}`;
        } else {
          label = "Other";
        }
        components.push({ interval_index, component, label });
      }

      metrics.push({ metric_id, metric_key, display_name, units, components });
    }

    metrics.sort((a, b) => {
      const byName = a.display_name.localeCompare(b.display_name);
      if (byName !== 0) return byName;
      if (a.units === b.units) return 0;
      // Prefer time ribbons first when both exist for same display name.
      if (a.units === "s") return -1;
      if (b.units === "s") return 1;
      return a.units.localeCompare(b.units);
    });

    return NextResponse.json({ data: { metrics } });
  } catch (err) {
    console.error("GET /api/leaderboard/session-metrics:", err);
    return NextResponse.json(
      { error: "Failed to fetch session metrics" },
      { status: 500 }
    );
  }
}
