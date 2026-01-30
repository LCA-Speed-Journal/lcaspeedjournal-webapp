/**
 * Athletes API - GET (public), POST (auth required).
 * Smoke test endpoint for Phase 1.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT id, first_name, last_name, gender, graduating_class, created_at
      FROM athletes
      ORDER BY last_name, first_name
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/athletes:", err);
    return NextResponse.json(
      { error: "Failed to fetch athletes" },
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
    const { first_name, last_name, gender, graduating_class } = body;

    if (!first_name || !last_name || !gender || graduating_class == null) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name, gender, graduating_class" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      INSERT INTO athletes (first_name, last_name, gender, graduating_class)
      VALUES (${first_name}, ${last_name}, ${gender}, ${Number(graduating_class)})
      RETURNING id, first_name, last_name, gender, graduating_class, created_at
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("POST /api/athletes:", err);
    return NextResponse.json(
      { error: "Failed to create athlete" },
      { status: 500 }
    );
  }
}
