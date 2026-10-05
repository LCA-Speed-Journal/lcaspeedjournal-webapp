import { NextRequest, NextResponse } from "next/server";
import {
  AttendanceStoreError,
  dismissContest,
  saveManualContest,
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
    if (typeof rec.contest_date !== "string") {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    await saveManualContest(rec.hugo_group, rec.contest_date, rec.label);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AttendanceStoreError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/weight-room/attendance/games:", err);
    return NextResponse.json(
      { error: "Failed to save game" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const hugoGroup = request.nextUrl.searchParams.get("hugo_group");
    const contestDate = request.nextUrl.searchParams.get("contest_date");
    if (!isHugoGroup(hugoGroup)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }
    if (!contestDate) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    await dismissContest(hugoGroup, contestDate);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AttendanceStoreError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("DELETE /api/weight-room/attendance/games:", err);
    return NextResponse.json(
      { error: "Failed to dismiss game" },
      { status: 500 }
    );
  }
}
