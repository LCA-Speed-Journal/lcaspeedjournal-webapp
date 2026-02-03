/**
 * Athlete flags API - GET (list stored + system flags), POST (add coach flag), PATCH (resolve).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { AthleteFlag } from "@/types";

const NO_DATA_DAYS = 14;
const DECLINING_SESSIONS = 3;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    let stored: (AthleteFlag & { created_at: string; resolved_at: string | null })[] = [];
    try {
      const { rows: storedRows } = await sql`
        SELECT id, athlete_id, flag_type, title, description, session_id, metric_key, created_by, created_at, resolved_at
        FROM athlete_flags
        WHERE athlete_id = ${athleteId}
        ORDER BY resolved_at IS NULL DESC, created_at DESC
      `;
      stored = (storedRows as AthleteFlag[]).map((r) => ({
      ...r,
      created_at: String(r.created_at),
      resolved_at: r.resolved_at ? String(r.resolved_at) : null,
    }));
    } catch (tableErr) {
      const msg = String((tableErr as Error)?.message ?? "");
      if (!msg.includes("does not exist") && !msg.includes("relation")) throw tableErr;
    }

    const systemFlags: { id: string; flag_type: "system"; title: string; description: string | null; created_at: string; resolved_at: null }[] = [];

    const now = new Date();
    const cutoffNoData = new Date(now);
    cutoffNoData.setDate(cutoffNoData.getDate() - NO_DATA_DAYS);

    const { rows: lastEntryRows } = await sql`
      SELECT MAX(s.session_date)::text AS last_date
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      WHERE e.athlete_id = ${athleteId}
    `;
    const lastDate = (lastEntryRows as { last_date: string | null }[])[0]?.last_date;
    if (lastDate) {
      const last = new Date(lastDate);
      if (last < cutoffNoData) {
        systemFlags.push({
          id: `system-no-data-${athleteId}`,
          flag_type: "system",
          title: "No entries in 14+ days",
          description: `Last entry: ${lastDate}`,
          created_at: now.toISOString(),
          resolved_at: null,
        });
      }
    } else {
      systemFlags.push({
        id: `system-no-data-ever-${athleteId}`,
        flag_type: "system",
        title: "No metric entries yet",
        description: "This athlete has no data in any session.",
        created_at: now.toISOString(),
        resolved_at: null,
      });
    }

    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 90);

    const { rows: recentRows } = await sql`
      SELECT s.session_date::text, e.metric_key, MIN(e.display_value) AS min_val, MAX(e.display_value) AS max_val
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      WHERE e.athlete_id = ${athleteId}
        AND s.session_date >= ${fromDate.toISOString().slice(0, 10)}
      GROUP BY s.session_date, e.metric_key
      ORDER BY s.session_date ASC
    `;

    const byMetric = new Map<string, { session_date: string; value: number }[]>();
    const registry = await import("@/lib/parser").then((m) => m.getMetricsRegistry());
    for (const r of recentRows as { session_date: string; metric_key: string; min_val: string; max_val: string }[]) {
      const def = registry[r.metric_key];
      const units = (def?.display_units ?? "").toLowerCase();
      const useMin = units === "s";
      const value = useMin ? Number(r.min_val) : Number(r.max_val);
      const list = byMetric.get(r.metric_key) ?? [];
      list.push({ session_date: r.session_date, value });
      byMetric.set(r.metric_key, list);
    }

    for (const [metricKey, points] of byMetric) {
      const sorted = [...points].sort((a, b) => a.session_date.localeCompare(b.session_date));
      if (sorted.length < DECLINING_SESSIONS) continue;
      const lastN = sorted.slice(-DECLINING_SESSIONS);
      const values = lastN.map((p) => p.value);
      const trend = values[values.length - 1] - values[0];
      const def = registry[metricKey];
      const isTimeMetric = (def?.display_units ?? "").toLowerCase() === "s";
      const declining = isTimeMetric ? trend > 0 : trend < 0;
      if (declining) {
        const displayName = def?.display_name ?? metricKey;
        systemFlags.push({
          id: `system-declining-${athleteId}-${metricKey}`,
          flag_type: "system",
          title: `Declining trend: ${displayName}`,
          description: `Last ${DECLINING_SESSIONS} sessions show worsening trend.`,
          created_at: now.toISOString(),
          resolved_at: null,
        });
      }
    }

    const activeStored = stored.filter((f) => !f.resolved_at);
    const allFlags = [...activeStored, ...systemFlags];

    return NextResponse.json({
      data: allFlags,
      stored,
      system: systemFlags,
    });
  } catch (err) {
    console.error("GET /api/athletes/[id]/flags:", err);
    return NextResponse.json(
      { error: "Failed to fetch flags" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: athleteId } = await params;
  try {
    const body = await request.json();
    const { title, description, session_id, metric_key } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid title" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      INSERT INTO athlete_flags (athlete_id, flag_type, title, description, session_id, metric_key, created_by)
      VALUES (${athleteId}, 'coach', ${title.trim()}, ${description?.trim() ?? null}, ${session_id ?? null}, ${metric_key ?? null}, ${session.user?.email ?? session.user?.name ?? "coach"})
      RETURNING id, athlete_id, flag_type, title, description, session_id, metric_key, created_by, created_at, resolved_at
    `;
    const row = rows[0] as Record<string, unknown>;
    if (row?.created_at) row.created_at = String(row.created_at);
    if (row?.resolved_at) row.resolved_at = String(row.resolved_at);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return NextResponse.json(
        { error: "Flags table not found. Run the Phase A migration." },
        { status: 500 }
      );
    }
    console.error("POST /api/athletes/[id]/flags:", err);
    return NextResponse.json(
      { error: "Failed to add flag" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: athleteId } = await params;
  try {
    const body = await request.json();
    const { flag_id, resolved } = body;

    if (!flag_id) {
      return NextResponse.json(
        { error: "Missing flag_id" },
        { status: 400 }
      );
    }

    if (String(flag_id).startsWith("system-")) {
      return NextResponse.json(
        { error: "System flags cannot be resolved" },
        { status: 400 }
      );
    }

    if (resolved !== true) {
      return NextResponse.json(
        { error: "Use resolved: true to resolve a flag" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      UPDATE athlete_flags
      SET resolved_at = NOW()
      WHERE id = ${flag_id} AND athlete_id = ${athleteId}
      RETURNING id, athlete_id, flag_type, title, description, session_id, metric_key, created_by, created_at, resolved_at
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }
    const row = rows[0] as Record<string, unknown>;
    if (row?.created_at) row.created_at = String(row.created_at);
    if (row?.resolved_at) row.resolved_at = String(row.resolved_at);
    return NextResponse.json({ data: row });
  } catch (err) {
    console.error("PATCH /api/athletes/[id]/flags:", err);
    return NextResponse.json(
      { error: "Failed to resolve flag" },
      { status: 500 }
    );
  }
}
