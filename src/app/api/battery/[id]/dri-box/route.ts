/**
 * Save the scored DRI height on Day A. Coach only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing } from "@/lib/battery/load";
import { DRI_BOXES } from "@/lib/battery/dri";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const box = typeof body?.box === "string" ? body.box.trim() : "";
    if (!box) {
      return NextResponse.json({ error: "Missing required field: box" }, { status: 400 });
    }
    if (!(DRI_BOXES as readonly string[]).includes(box)) {
      return NextResponse.json({ error: "box must be 6, 12, 18, or 24" }, { status: 400 });
    }

    const updated = await sql`
      UPDATE testing_battery_days
      SET locked_dri_box = ${box}
      WHERE battery_id = ${id} AND day_key = ${"A"}
      RETURNING locked_dri_box
    `;
    if (!updated.rows.length) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { locked_dri_box: box } });
  } catch (err) {
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    console.error("POST /api/battery/[id]/dri-box:", err);
    return NextResponse.json({ error: "Failed to save DRI height" }, { status: 500 });
  }
}
