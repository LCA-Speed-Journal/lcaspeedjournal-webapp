/**
 * Entries API - POST (auth required).
 * Parses raw input per metric registry, applies conversions, inserts into entries.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseEntry, getMetricsRegistry } from "@/lib/parser";

const INSERT_TIMEOUT_MS = 15000;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { session_id, athlete_id, metric_key, raw_input } = body;

    if (!session_id || !athlete_id || !metric_key || raw_input == null || raw_input === "") {
      return NextResponse.json(
        { error: "Missing required fields: session_id, athlete_id, metric_key, raw_input" },
        { status: 400 }
      );
    }

    const rawInputStr = String(raw_input).trim();
    if (!rawInputStr) {
      return NextResponse.json(
        { error: "raw_input cannot be empty" },
        { status: 400 }
      );
    }

    const registry = getMetricsRegistry();
    if (!registry[metric_key]) {
      return NextResponse.json(
        { error: `Unknown metric: ${metric_key}` },
        { status: 400 }
      );
    }

    // Fetch session for day_splits / day_components overrides
    const sessionRows = await sql`
      SELECT day_splits, day_components
      FROM sessions
      WHERE id = ${session_id}
      LIMIT 1
    `;
    if (!sessionRows.rows.length) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }
    const sess = sessionRows.rows[0] as {
      day_splits?: Record<string, number[]>;
      day_components?: Record<string, string[]>;
    };
    const sessionOverrides =
      sess.day_splits || sess.day_components
        ? { day_splits: sess.day_splits, day_components: sess.day_components }
        : undefined;

    // Verify athlete exists
    const athleteRows = await sql`
      SELECT id FROM athletes WHERE id = ${athlete_id} LIMIT 1
    `;
    if (!athleteRows.rows.length) {
      return NextResponse.json(
        { error: "Athlete not found" },
        { status: 404 }
      );
    }

    const parsed = parseEntry(metric_key, rawInputStr, sessionOverrides);

    const ids: string[] = [];
    for (const row of parsed) {
      const insertPromise = sql`
        INSERT INTO entries (
          session_id, athlete_id, metric_key,
          interval_index, component,
          value, display_value, units, raw_input
        )
        VALUES (
          ${session_id},
          ${athlete_id},
          ${row.metric_key},
          ${row.interval_index},
          ${row.component},
          ${row.value},
          ${row.display_value},
          ${row.units},
          ${rawInputStr}
        )
        RETURNING id
      `;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("insert_timeout")), INSERT_TIMEOUT_MS)
      );
      const result = await Promise.race([insertPromise, timeoutPromise]);
      const { rows } = result;
      const id = (rows[0] as { id: string })?.id;
      if (id) ids.push(id);
    }

    return NextResponse.json(
      { data: { count: parsed.length, ids } },
      { status: 201 }
    );
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (msg === "insert_timeout") {
      return NextResponse.json(
        { error: "Database insert timed out" },
        { status: 503 }
      );
    }
    if (msg.includes("Cannot parse") || msg.includes("does not match") || msg.includes("Unknown metric")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("POST /api/entries:", err);
    return NextResponse.json(
      { error: "Failed to create entries" },
      { status: 500 }
    );
  }
}
