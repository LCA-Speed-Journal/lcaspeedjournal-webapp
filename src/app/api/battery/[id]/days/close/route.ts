/**
 * Close a testing day. Day A also locks the team DRI box. Coach only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing } from "@/lib/battery/load";
import { resolveScoredDriBox } from "@/lib/battery/dri";

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
    const dayKey = typeof body?.day_key === "string" ? body.day_key.trim() : "";
    if (!dayKey) {
      return NextResponse.json({ error: "Missing required field: day_key" }, { status: 400 });
    }

    const [batteryResult, dayResult] = await Promise.all([
      sql`SELECT id FROM testing_batteries WHERE id = ${id} LIMIT 1`,
      sql`
        SELECT id, locked_dri_box
        FROM testing_battery_days
        WHERE battery_id = ${id} AND day_key = ${dayKey}
        LIMIT 1
      `,
    ]);
    if (!batteryResult.rows.length) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (!dayResult.rows.length) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }

    const day = dayResult.rows[0] as { id: string; locked_dri_box: string | null };
    let lockedDriBox: string | null = null;
    if (dayKey === "A") {
      lockedDriBox = resolveScoredDriBox(
        day.locked_dri_box == null ? null : String(day.locked_dri_box)
      );
      await sql`
        UPDATE testing_battery_days
        SET closed_at = NOW(), locked_dri_box = ${lockedDriBox}
        WHERE id = ${day.id}
      `;
    } else {
      await sql`
        UPDATE testing_battery_days
        SET closed_at = NOW()
        WHERE id = ${day.id}
      `;
    }

    return NextResponse.json({ data: { locked_dri_box: lockedDriBox } });
  } catch (err) {
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    console.error("POST /api/battery/[id]/days/close:", err);
    return NextResponse.json({ error: "Failed to close day" }, { status: 500 });
  }
}
