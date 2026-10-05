import { NextRequest, NextResponse } from "next/server";
import { BoundScheduleError } from "@/lib/attendance/bound";
import {
  AttendanceStoreError,
  refreshVarsityContests,
} from "@/lib/attendance/store";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";

export async function POST(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rec =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};
    if (!isHugoGroup(rec.hugo_group)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }

    const result = await refreshVarsityContests(rec.hugo_group);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof BoundScheduleError) {
      return NextResponse.json(
        { error: "Bound did not return a schedule" },
        { status: 502 }
      );
    }
    if (err instanceof AttendanceStoreError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/weight-room/attendance/games/refresh:", err);
    return NextResponse.json(
      { error: "Failed to refresh games" },
      { status: 500 }
    );
  }
}
