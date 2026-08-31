/**
 * Public list of active norm populations (id + name only).
 * No PIN — live leaderboard dropdown needs this without coach login.
 * Cuts are never returned here.
 * POST is coach-only create.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { parsePopulationCreateBody } from "@/lib/norms/editor";

function isDuplicateNameError(err: unknown): boolean {
  const e = err as Error & { code?: string };
  const msg = String(e?.message ?? "").toLowerCase();
  return e?.code === "23505" || msg.includes("unique") || msg.includes("duplicate");
}

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT id, name
      FROM norm_populations
      WHERE archived_at IS NULL
      ORDER BY name ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/norms/populations:", err);
    return NextResponse.json(
      { error: "Failed to fetch populations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parsePopulationCreateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { rows } = await sql`
      INSERT INTO norm_populations (name, notes)
      VALUES (${parsed.value.name}, ${parsed.value.notes})
      RETURNING id, name, notes, archived_at, created_at
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    if (isDuplicateNameError(err)) {
      return NextResponse.json(
        { error: "A population with that name already exists" },
        { status: 400 }
      );
    }
    console.error("POST /api/norms/populations:", err);
    return NextResponse.json(
      { error: "Failed to create population" },
      { status: 500 }
    );
  }
}
