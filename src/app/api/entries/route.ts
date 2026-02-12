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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    if (!sessionId || sessionId.trim() === "") {
      return NextResponse.json(
        { error: "session_id query parameter is required" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      SELECT e.id, e.session_id, e.athlete_id, e.metric_key, e.interval_index, e.component,
             e.value, e.display_value, e.units, e.raw_input, e.created_at,
             a.first_name, a.last_name
      FROM entries e
      JOIN athletes a ON a.id = e.athlete_id
      WHERE e.session_id = ${sessionId}
      ORDER BY a.last_name, a.first_name, e.metric_key, e.interval_index NULLS LAST, e.component NULLS LAST
    `;

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/entries:", err);
    return NextResponse.json(
      { error: "Failed to fetch entries" },
      { status: 500 }
    );
  }
}

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

    // Fetch session and athlete in parallel (independent ops)
    const [sessionResult, athleteResult] = await Promise.all([
      sql`
        SELECT day_splits, day_components
        FROM sessions
        WHERE id = ${session_id}
        LIMIT 1
      `,
      sql`
        SELECT id FROM athletes WHERE id = ${athlete_id} LIMIT 1
      `,
    ]);
    if (!sessionResult.rows.length) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }
    if (!athleteResult.rows.length) {
      return NextResponse.json(
        { error: "Athlete not found" },
        { status: 404 }
      );
    }
    const sess = sessionResult.rows[0] as {
      day_splits?: Record<string, number[]>;
      day_components?: Record<string, string[]>;
    };
    const sessionOverrides =
      sess.day_splits || sess.day_components
        ? { day_splits: sess.day_splits, day_components: sess.day_components }
        : undefined;

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
