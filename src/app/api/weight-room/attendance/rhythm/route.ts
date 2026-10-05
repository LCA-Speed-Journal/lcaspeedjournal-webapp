import { NextRequest, NextResponse } from "next/server";
import {
  AttendanceStoreError,
  saveRhythm,
} from "@/lib/attendance/store";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";

export async function PUT(request: NextRequest) {
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

    const weekdays = await saveRhythm(rec.hugo_group, rec.weekdays);
    return NextResponse.json({ data: weekdays });
  } catch (err) {
    if (err instanceof AttendanceStoreError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("PUT /api/weight-room/attendance/rhythm:", err);
    return NextResponse.json(
      { error: "Failed to save rhythm" },
      { status: 500 }
    );
  }
}
