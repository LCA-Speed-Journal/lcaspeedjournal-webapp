/**
 * Battery board - public read, same as the live leaderboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { isBatterySchemaMissing, loadBatteryBoard, readPgError } from "@/lib/battery/load";
import { databaseErrorBody, rememberRead } from "@/lib/db-guard";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const viewParam = searchParams.get("view") ?? "today";
    if (viewParam !== "today" && viewParam !== "day" && viewParam !== "meet") {
      return NextResponse.json({ error: "view must be today, day, or meet" }, { status: 400 });
    }
    const dayParam = searchParams.get("day")?.trim() ?? "";
    if (viewParam === "day" && dayParam === "") {
      return NextResponse.json({ error: "Choose a testing day." }, { status: 400 });
    }
    const groupParam = searchParams.get("group");
    const group = groupParam == null || groupParam.trim() === "" ? "overall" : groupParam.trim();
    const sample = searchParams.get("sample") === "1" && process.env.NODE_ENV !== "production";
    const data = await rememberRead(
      `board:${id}:${viewParam}:${dayParam}:${group}:${sample ? "1" : "0"}`,
      () =>
        loadBatteryBoard(id, {
          view: viewParam,
          group,
          dayKey: dayParam,
          sample,
        })
    );
    if (!data) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (viewParam === "day" && data.day_key == null) {
      return NextResponse.json({ error: "That testing day is not on this battery." }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    const quota = databaseErrorBody(err);
    if (quota) return NextResponse.json({ error: quota.error }, { status: quota.status });
    console.error("GET /api/battery/[id]/board:", err);
    return NextResponse.json({ error: "Failed to load battery board" }, { status: 500 });
  }
}
