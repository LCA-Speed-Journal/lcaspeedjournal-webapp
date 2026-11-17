/**
 * Door sheet PDF for one finished testing day. Coach only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  isBatterySchemaMissing,
  loadBatteryBoard,
  readPgError,
} from "@/lib/battery/load";
import {
  DOOR_SHEET_TITLE,
  doorSheetAthletes,
  doorSheetColumns,
  doorSheetDayHeading,
  doorSheetFilename,
  renderDoorSheet,
  type DoorSheetData,
} from "@/lib/battery/door-sheet";

export const runtime = "nodejs";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
}

function pdfResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dayParam = searchParams.get("day")?.trim() ?? "";
    if (!/^[A-D]$/i.test(dayParam)) {
      return NextResponse.json({ error: "Choose a testing day." }, { status: 400 });
    }
    const dayKey = dayParam.toUpperCase();
    const groupParam = searchParams.get("group");
    const group = groupParam == null || groupParam.trim() === "" ? "overall" : groupParam.trim();

    const board = await loadBatteryBoard(id, { view: "day", dayKey, group });
    if (!board || board.day_key !== dayKey) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }

    const columns = doorSheetColumns(dayKey, board.columns, board.battery.team_dri_box);
    const data: DoorSheetData = {
      title: DOOR_SHEET_TITLE,
      dayLabel: doorSheetDayHeading(dayKey, board.day_label),
      columns,
      rows: doorSheetAthletes(
        board.athletes,
        columns.map((column) => column.key)
      ),
    };
    const buffer = await renderDoorSheet(data);
    return pdfResponse(buffer, doorSheetFilename(dayKey));
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 404 });
    }
    console.error("GET /api/battery/[id]/door-sheet:", err);
    return NextResponse.json({ error: "Failed to build door sheet" }, { status: 500 });
  }
}
