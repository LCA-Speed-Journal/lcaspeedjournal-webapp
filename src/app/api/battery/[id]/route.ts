/**
 * Switch a battery between the top-18 line and team lists. Coach only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setGroupingMode } from "@/lib/battery/group-store";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";
import { isGroupingMode } from "@/lib/battery/testing-groups";

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
    const mode = typeof body?.grouping_mode === "string" ? body.grouping_mode.trim() : "";
    if (!isGroupingMode(mode)) {
      return NextResponse.json({ error: "Grouping must be cutoff or subteam." }, { status: 400 });
    }
    const saved = await setGroupingMode(id, mode);
    if (!saved) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { grouping_mode: mode } });
  } catch (err) {
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    console.error("PATCH /api/battery/[id]:", err);
    return NextResponse.json({ error: "Failed to change grouping" }, { status: 500 });
  }
}
