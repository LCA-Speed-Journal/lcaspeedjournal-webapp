/**
 * Single event group API - GET (public), PUT (auth), DELETE (auth).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { rows } = await sql`
      SELECT id, name, display_order, created_at
      FROM event_groups
      WHERE id = ${id}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Event group not found" }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    console.error("GET /api/event-groups/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch event group" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { name, display_order } = body;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return NextResponse.json(
        { error: "Invalid name" },
        { status: 400 }
      );
    }

    if (name !== undefined && display_order !== undefined) {
      const order = Number(display_order);
      const { rows } = await sql`
        UPDATE event_groups
        SET name = ${name.trim()}, display_order = ${order}
        WHERE id = ${id}
        RETURNING id, name, display_order, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Event group not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }
    if (name !== undefined) {
      const { rows } = await sql`
        UPDATE event_groups
        SET name = ${name.trim()}
        WHERE id = ${id}
        RETURNING id, name, display_order, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Event group not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }
    if (display_order !== undefined) {
      const order = Number(display_order);
      const { rows } = await sql`
        UPDATE event_groups
        SET display_order = ${order}
        WHERE id = ${id}
        RETURNING id, name, display_order, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Event group not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }

    return NextResponse.json(
      { error: "Provide name and/or display_order to update" },
      { status: 400 }
    );
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "An event group with that name already exists" },
        { status: 400 }
      );
    }
    console.error("PUT /api/event-groups/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update event group" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
      DELETE FROM event_groups WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Event group not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error("DELETE /api/event-groups/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete event group" },
      { status: 500 }
    );
  }
}
