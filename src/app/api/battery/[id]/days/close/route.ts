/**
 * Close a testing day. Day A also locks the team DRI box. Coach only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing } from "@/lib/battery/load";
import { pickTeamDriBox } from "@/lib/battery/dri";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

function finiteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

async function driMarks(sessionId: string | null): Promise<{ box: string; value: number }[]> {
  if (!sessionId) return [];
  const { rows } = await sql`
    SELECT component, display_value
    FROM entries
    WHERE session_id = ${sessionId}
      AND metric_key = ${"DRI"}
  `;
  const marks: { box: string; value: number }[] = [];
  for (const row of rows as { component: string | null; display_value: unknown }[]) {
    if (row.component == null || String(row.component).trim() === "") continue;
    const value = finiteNumber(row.display_value);
    if (value == null) continue;
    marks.push({ box: String(row.component), value });
  }
  return marks;
}

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
        SELECT id, session_id
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

    const day = dayResult.rows[0] as { id: string; session_id: string | null };
    let lockedDriBox: string | null = null;
    if (dayKey === "A") {
      lockedDriBox = pickTeamDriBox(await driMarks(day.session_id == null ? null : String(day.session_id)));
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
