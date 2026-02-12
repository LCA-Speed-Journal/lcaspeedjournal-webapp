/**
 * Sessions API - GET single session by id, PATCH (auth required).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { rows } = await sql`
      SELECT id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
      FROM sessions
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ data: serializeSessionRow(rows[0] as Record<string, unknown>) });
  } catch (err) {
    console.error("GET /api/sessions/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await getServerSession(authOptions);
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
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
        { error: "Missing required fields: session_date, phase, phase_week" },
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

    const { rows } = await sql`
      UPDATE sessions
      SET
        session_date = ${String(session_date)},
        phase = ${String(phase)},
        phase_week = ${week},
        day_metrics = ${dayMetricsJson},
        day_splits = ${daySplitsJson},
        session_notes = ${notes}
      WHERE id = ${id}
      RETURNING id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
    `;

    if (!rows.length) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: serializeSessionRow(rows[0] as Record<string, unknown>),
    });
  } catch (err) {
    console.error("PATCH /api/sessions/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
