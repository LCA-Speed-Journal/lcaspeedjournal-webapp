/**
 * Coach-only population list: notes + archived rows.
 * Public GET /api/norms/populations stays id+name, active only.
 */
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";

export async function GET() {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await sql`
      SELECT id, name, notes, archived_at, created_at
      FROM norm_populations
      ORDER BY archived_at NULLS FIRST, name ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/norms/populations/manage:", err);
    return NextResponse.json(
      { error: "Failed to fetch populations" },
      { status: 500 }
    );
  }
}
