/**
 * Landscape meet PDF. Coach only. Ignores day; optional group defaults to overall.
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
  meetSheetFilename,
  meetSheetTitle,
  renderMeetSheet,
  type MeetSheetData,
} from "@/lib/battery/meet-sheet";

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
    const groupParam = searchParams.get("group");
    const group = groupParam == null || groupParam.trim() === "" ? "overall" : groupParam.trim();
    const sample = searchParams.get("sample") === "1" && process.env.NODE_ENV !== "production";

    const board = await loadBatteryBoard(id, { view: "meet", group, sample });
    if (!board) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }

    const data: MeetSheetData = {
      title: meetSheetTitle(board.battery.hugo_group),
      columns: board.columns,
      rows: board.athletes,
    };
    const buffer = await renderMeetSheet(data);
    return pdfResponse(buffer, meetSheetFilename(board.battery.hugo_group));
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 404 });
    }
    console.error("GET /api/battery/[id]/meet-sheet:", err);
    return NextResponse.json({ error: "Failed to build meet sheet" }, { status: 500 });
  }
}
