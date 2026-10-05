import { NextRequest, NextResponse } from "next/server";
import { assertAttendanceRange } from "@/lib/attendance/dates";
import { buildAttendanceReport } from "@/lib/attendance/report";
import { loadAttendanceInput } from "@/lib/attendance/store";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const hugoGroup = request.nextUrl.searchParams.get("hugo_group");
  if (!isHugoGroup(hugoGroup)) {
    return NextResponse.json({ error: "Invalid hugo_group" }, { status: 400 });
  }

  const from = (request.nextUrl.searchParams.get("from") ?? "").trim();
  const to = (request.nextUrl.searchParams.get("to") ?? "").trim();
  const range = assertAttendanceRange(from, to);
  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  try {
    const input = await loadAttendanceInput(hugoGroup, from, to);
    return NextResponse.json({ data: buildAttendanceReport(input) });
  } catch (err) {
    console.error("GET /api/weight-room/attendance:", err);
    return NextResponse.json(
      { error: "Failed to load attendance" },
      { status: 500 },
    );
  }
}
