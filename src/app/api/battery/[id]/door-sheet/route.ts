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
  doorSheetAthletes,
  doorSheetColumnKeys,
  doorSheetFilename,
  renderDoorSheet,
  type DoorSheetData,
} from "@/lib/battery/door-sheet";

export const runtime = "nodejs";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

const DAY_A_LABELS: Record<string, { label: string; units: string }> = {
  "10yd_Split": { label: "0-10", units: "s" },
  "20yd_Dash": { label: "0-20", units: "s" },
  "40yd_Dash": { label: "0-40", units: "s" },
  MaxVelocity: { label: "Max V", units: "mph" },
  "10-5_RSI": { label: "RSI", units: "RSI" },
  DRI: { label: "DRI", units: "DRI" },
};

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

    const keys = doorSheetColumnKeys(
      dayKey,
      board.columns.map((column) => column.key)
    );
    const byKey = new Map(board.columns.map((column) => [column.key, column]));
    const columns = keys.map((key) => {
      if (dayKey === "A") {
        const fixed = DAY_A_LABELS[key];
        return { key, label: fixed?.label ?? key, units: fixed?.units ?? "" };
      }
      const column = byKey.get(key);
      return { key, label: column?.label ?? key, units: column?.units ?? "" };
    });
    const data: DoorSheetData = {
      title: board.battery.title.trim(),
      dayLabel: board.day_label.trim(),
      driBox: board.battery.team_dri_box,
      columns,
      rows: doorSheetAthletes(board.athletes, keys),
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
