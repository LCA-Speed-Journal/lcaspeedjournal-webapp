/**
 * Public list of active norm populations (id + name only).
 * No PIN — live leaderboard dropdown needs this without coach login.
 * Cuts are never returned here.
 */
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

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
