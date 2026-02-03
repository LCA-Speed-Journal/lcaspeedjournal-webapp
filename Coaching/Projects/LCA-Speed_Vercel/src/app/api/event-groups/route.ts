/**
 * Event groups API - GET (public list), POST (auth required).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT id, name, display_order, created_at
      FROM event_groups
      ORDER BY display_order ASC, name ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/event-groups:", err);
    return NextResponse.json(
      { error: "Failed to fetch event groups" },
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
    const { name, display_order } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid name" },
        { status: 400 }
      );
    }

    const order = display_order != null ? Number(display_order) : 0;

    const { rows } = await sql`
      INSERT INTO event_groups (name, display_order)
      VALUES (${name.trim()}, ${order})
      RETURNING id, name, display_order, created_at
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    const e = err as Error & { code?: string };
    const msg = String(e?.message ?? "").toLowerCase();
    const code = e?.code;

    if (code === "23505" || msg.includes("unique") || msg.includes("duplicate") || msg.includes("violates")) {
      return NextResponse.json(
        { error: "An event group with that name already exists" },
        { status: 400 }
      );
    }
    if (code === "42P01" || msg.includes("does not exist") || msg.includes("relation")) {
      console.error("POST /api/event-groups (schema):", err);
      return NextResponse.json(
        { error: "Event groups table not found. Run the Phase A migration (scripts/migrate-phase-a-dashboard.sql)." },
        { status: 500 }
      );
    }
    console.error("POST /api/event-groups:", err);
    return NextResponse.json(
      { error: "Failed to create event group" },
      { status: 500 }
    );
  }
}
