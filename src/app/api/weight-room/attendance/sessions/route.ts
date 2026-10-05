import { NextRequest, NextResponse } from "next/server";
import {
  AttendanceStoreError,
  clearEdit,
  saveEdit,
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
    if (typeof rec.session_date !== "string") {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    if (
      rec.action !== "add" &&
      rec.action !== "cancel" &&
      rec.action !== "clear"
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (rec.action === "clear") {
      await clearEdit(rec.hugo_group, rec.session_date);
    } else {
      await saveEdit(rec.hugo_group, rec.session_date, rec.action);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AttendanceStoreError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("PUT /api/weight-room/attendance/sessions:", err);
    return NextResponse.json(
      { error: "Failed to save session edit" },
      { status: 500 }
    );
  }
}
