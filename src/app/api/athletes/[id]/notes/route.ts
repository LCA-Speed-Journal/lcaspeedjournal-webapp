/**
 * Athlete notes API - coach only. GET (list), POST (add).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const { rows } = await sql`
      SELECT id, athlete_id, note_text, created_by, created_at
      FROM athlete_notes
      WHERE athlete_id = ${id}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/athletes/[id]/notes:", err);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
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

  const { id } = await params;
  try {
    const body = await request.json();
    const { note_text } = body;

    if (!note_text || typeof note_text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid note_text" },
        { status: 400 }
      );
    }

    const createdBy =
      session.user?.email ?? session.user?.name ?? "coach";

    const { rows } = await sql`
      INSERT INTO athlete_notes (athlete_id, note_text, created_by)
      VALUES (${id}, ${note_text.trim()}, ${createdBy})
      RETURNING id, athlete_id, note_text, created_by, created_at
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("POST /api/athletes/[id]/notes:", err);
    return NextResponse.json(
      { error: "Failed to add note" },
      { status: 500 }
    );
  }
}
