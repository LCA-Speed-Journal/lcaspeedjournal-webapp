/**
 * Athlete event groups API - GET (list assigned), POST (assign), DELETE (remove).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    const { rows } = await sql`
      SELECT eg.id, eg.name, eg.display_order, eg.created_at
      FROM event_groups eg
      INNER JOIN athlete_event_groups aeg ON aeg.event_group_id = eg.id
      WHERE aeg.athlete_id = ${athleteId}
      ORDER BY eg.display_order ASC, eg.name ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/athletes/[id]/event-groups:", err);
    return NextResponse.json(
      { error: "Failed to fetch athlete event groups" },
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
    const { event_group_id } = body;

    if (!event_group_id) {
      return NextResponse.json(
        { error: "Missing event_group_id" },
        { status: 400 }
      );
    }

    await sql`
      INSERT INTO athlete_event_groups (athlete_id, event_group_id)
      VALUES (${athleteId}, ${event_group_id})
      ON CONFLICT (athlete_id, event_group_id) DO NOTHING
    `;

    const { rows } = await sql`
      SELECT eg.id, eg.name, eg.display_order, eg.created_at
      FROM event_groups eg
      INNER JOIN athlete_event_groups aeg ON aeg.event_group_id = eg.id
      WHERE aeg.athlete_id = ${athleteId}
      ORDER BY eg.display_order ASC, eg.name ASC
    `;
    return NextResponse.json({ data: rows }, { status: 201 });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return NextResponse.json(
        { error: "Athlete or event group not found" },
        { status: 404 }
      );
    }
    console.error("POST /api/athletes/[id]/event-groups:", err);
    return NextResponse.json(
      { error: "Failed to assign event group" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: athleteId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const eventGroupId = searchParams.get("event_group_id");

    if (!eventGroupId) {
      return NextResponse.json(
        { error: "Missing event_group_id query parameter" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      DELETE FROM athlete_event_groups
      WHERE athlete_id = ${athleteId} AND event_group_id = ${eventGroupId}
      RETURNING athlete_id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    console.error("DELETE /api/athletes/[id]/event-groups:", err);
    return NextResponse.json(
      { error: "Failed to remove event group" },
      { status: 500 }
    );
  }
}
