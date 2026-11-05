/**
 * Frozen Friday lane heats. Coach only.
 * The first POST stores the A+B place order. A later POST returns that row.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, withTransaction } from "@/lib/db";
import { orderBoard } from "@/lib/battery/board-order";
import {
  isBatterySchemaMissing,
  loadBatteryBoard,
  readPgError,
  type BoardPayload,
} from "@/lib/battery/load";
import { freezeLaneSheet, parseFrozenLaneSheet, type FrozenLaneSheet } from "@/lib/battery/lanes";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
}

function sheetFromBoard(board: BoardPayload): FrozenLaneSheet {
  const ordered = orderBoard(board.athletes, board.untested_ids);
  return freezeLaneSheet(
    ordered.map((row) => ({
      athlete_id: row.athlete.athlete_id,
      first_name: row.athlete.first_name,
      last_name: row.athlete.last_name,
      place: row.place,
    }))
  );
}

function sheetResponse(sheet: FrozenLaneSheet) {
  return NextResponse.json({
    heats: sheet.heats,
    cutoff_after_heat: sheet.cutoff_after_heat,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const [batteryResult, sheetResult] = await Promise.all([
      sql`SELECT id FROM testing_batteries WHERE id = ${id} LIMIT 1`,
      sql`SELECT heats FROM testing_battery_lane_sheets WHERE battery_id = ${id} LIMIT 1`,
    ]);
    if (!batteryResult.rows.length) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (!sheetResult.rows.length) {
      return NextResponse.json({ heats: null });
    }
    const sheet = parseFrozenLaneSheet((sheetResult.rows[0] as { heats?: unknown }).heats);
    if (!sheet) {
      return NextResponse.json({ error: "Stored lane sheet could not be read" }, { status: 500 });
    }
    return sheetResponse(sheet);
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("GET /api/battery/[id]/lanes:", err);
    return NextResponse.json({ error: "Failed to load lane sheet" }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const outcome = await withTransaction(async (tx) => {
      const batteryResult = await tx`
        SELECT id FROM testing_batteries WHERE id = ${id} FOR UPDATE
      `;
      if (!batteryResult.rows.length) return { status: "missing" as const };
      const existing = await tx`
        SELECT heats FROM testing_battery_lane_sheets WHERE battery_id = ${id} LIMIT 1
      `;
      if (existing.rows.length) {
        const sheet = parseFrozenLaneSheet((existing.rows[0] as { heats?: unknown }).heats);
        if (!sheet) return { status: "corrupt" as const };
        return { status: "ok" as const, sheet };
      }

      const board = await loadBatteryBoard(id, {
        view: "meet",
        group: "overall",
        dayKeys: ["A", "B"],
      });
      if (!board) return { status: "missing" as const };
      const sheet = sheetFromBoard(board);
      await tx`
        INSERT INTO testing_battery_lane_sheets (battery_id, heats)
        VALUES (${id}::uuid, ${JSON.stringify(sheet)}::jsonb)
      `;
      return { status: "ok" as const, sheet };
    });

    if (outcome.status === "missing") {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (outcome.status === "corrupt") {
      return NextResponse.json({ error: "Stored lane sheet could not be read" }, { status: 500 });
    }
    return sheetResponse(outcome.sheet);
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("POST /api/battery/[id]/lanes:", err);
    return NextResponse.json({ error: "Failed to freeze lane sheet" }, { status: 500 });
  }
}
