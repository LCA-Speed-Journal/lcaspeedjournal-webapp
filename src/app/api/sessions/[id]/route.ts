/**
 * Sessions API - GET single session by id.
 */
import { NextRequest, NextResponse } from "next/server";
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
