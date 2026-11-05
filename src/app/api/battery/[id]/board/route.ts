/**
 * Battery board - public read, same as the live leaderboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { isBatterySchemaMissing, loadBatteryBoard, readPgError } from "@/lib/battery/load";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const viewParam = searchParams.get("view") ?? "today";
    if (viewParam !== "today" && viewParam !== "meet") {
      return NextResponse.json({ error: "view must be today or meet" }, { status: 400 });
    }
    const groupParam = searchParams.get("group");
    const group = groupParam == null || groupParam.trim() === "" ? "overall" : groupParam.trim();
    const data = await loadBatteryBoard(id, { view: viewParam, group });
    if (!data) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    console.error("GET /api/battery/[id]/board:", err);
    return NextResponse.json({ error: "Failed to load battery board" }, { status: 500 });
  }
}
