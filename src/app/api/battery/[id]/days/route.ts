/**
 * Link a testing day to an existing session. Coach only. Does not create sessions.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

export async function PATCH(
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
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!dayKey || !sessionId) {
      return NextResponse.json(
        { error: "Missing required fields: day_key, session_id" },
        { status: 400 }
      );
    }

    const [batteryResult, dayResult] = await Promise.all([
      sql`SELECT id FROM testing_batteries WHERE id = ${id} LIMIT 1`,
      sql`
        SELECT id, session_id, closed_at
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

    const day = dayResult.rows[0] as {
      session_id: string | null;
      closed_at: string | Date | null;
    };
    const previousSession = day.session_id == null ? null : String(day.session_id);
    const relink = day.closed_at != null && previousSession !== sessionId;
    if (relink && dayKey === "A") {
      await sql`
        UPDATE testing_battery_days
        SET session_id = ${sessionId}, closed_at = NULL, locked_dri_box = NULL
        WHERE battery_id = ${id} AND day_key = ${dayKey}
      `;
    } else if (relink) {
      await sql`
        UPDATE testing_battery_days
        SET session_id = ${sessionId}, closed_at = NULL
        WHERE battery_id = ${id} AND day_key = ${dayKey}
      `;
    } else {
      await sql`
        UPDATE testing_battery_days
        SET session_id = ${sessionId}
        WHERE battery_id = ${id} AND day_key = ${dayKey}
      `;
    }
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    const { codes } = readPgError(err);
    if (codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    if (codes.includes("23503")) {
      return NextResponse.json({ error: "Session not found" }, { status: 400 });
    }
    console.error("PATCH /api/battery/[id]/days:", err);
    return NextResponse.json({ error: "Failed to link session" }, { status: 500 });
  }
}
