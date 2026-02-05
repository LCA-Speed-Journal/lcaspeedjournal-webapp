/**
 * Sessions API - GET (public list), POST (auth required).
 * Phase 2: Session setup for data entry.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

const INSERT_TIMEOUT_MS = 12000;

function serializeSessionRow(row: Record<string, unknown>) {
  return {
    ...row,
    session_date:
      row.session_date instanceof Date
        ? row.session_date.toISOString().slice(0, 10)
        : row.session_date,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
      FROM sessions
      ORDER BY session_date DESC, created_at DESC
      LIMIT 100
    `;
    const data = (rows as Record<string, unknown>[]).map(serializeSessionRow);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/sessions:", err);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
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
    const {
      session_date,
      phase,
      phase_week,
      day_metrics,
      day_splits,
      session_notes,
    } = body;

    if (!session_date || !phase || phase_week == null) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: session_date, phase, phase_week",
        },
        { status: 400 }
      );
    }

    const week = Number(phase_week);
    if (Number.isNaN(week) || week < 0 || week > 5) {
      return NextResponse.json(
        { error: "phase_week must be between 0 and 5" },
        { status: 400 }
      );
    }

    const dayMetricsJson =
      Array.isArray(day_metrics) && day_metrics.length > 0
        ? JSON.stringify(day_metrics)
        : null;
    let daySplitsJson: string | null = null;
    if (
      day_splits != null &&
      typeof day_splits === "object" &&
      !Array.isArray(day_splits)
    ) {
      const sanitized: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(day_splits)) {
        if (Array.isArray(v) && v.every((n) => typeof n === "number" && n > 0)) {
          sanitized[k] = v as number[];
        }
      }
      if (Object.keys(sanitized).length > 0) {
        daySplitsJson = JSON.stringify(sanitized);
      }
    }
    const notes = session_notes ?? null;

    const insertPromise = sql`
      INSERT INTO sessions (session_date, phase, phase_week, day_metrics, day_splits, session_notes)
      VALUES (
        ${String(session_date)},
        ${String(phase)},
        ${week},
        ${dayMetricsJson},
        ${daySplitsJson},
        ${notes}
      )
      RETURNING id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
    `;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("insert_timeout")),
        INSERT_TIMEOUT_MS
      )
    );
    const result = await Promise.race([insertPromise, timeoutPromise]);
    const { rows } = result;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    const msg = (err as Error)?.message;
    if (msg === "insert_timeout") {
      return NextResponse.json(
        {
          error:
            "Database connection timed out. POSTGRES_URL must contain the exact substring \"-pooler.\" (e.g. host like xxx-pooler.region.vercel-storage.com). In Vercel: Storage → Postgres → Connect, use the pooled connection string. Restart the dev server after changing .env.local.",
        },
        { status: 503 }
      );
    }
    console.error("POST /api/sessions:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
