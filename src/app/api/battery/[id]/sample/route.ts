/**
 * Local-only edits to the sample board. Nothing here is written to the database.
 * The gym board reads the same in-memory overrides on its next refresh.
 */
import { NextRequest, NextResponse } from "next/server";
import { loadBatteryBoard } from "@/lib/battery/load";
import {
  SAMPLE_EDIT_KEYS,
  clearSampleOverrides,
  isSampleEditKey,
  writeSampleOverride,
} from "@/lib/battery/sample-overrides";

function localOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Sample adjustments are only on the local server." }, { status: 404 });
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = localOnly();
  if (blocked) return blocked;
  const { id } = await params;
  const board = await loadBatteryBoard(id, { view: "meet", group: "overall", sample: true });
  if (!board) return NextResponse.json({ error: "Battery not found" }, { status: 404 });
  return NextResponse.json({
    data: {
      columns: SAMPLE_EDIT_KEYS.map((key) => {
        const column = board.columns.find((item) => item.key === key);
        return { key, label: column?.label ?? key, units: column?.units ?? "" };
      }),
      athletes: board.athletes
        .map((athlete) => ({
          athlete_id: athlete.athlete_id,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
          values: Object.fromEntries(
            SAMPLE_EDIT_KEYS.map((key) => [key, athlete.cells[key]?.value ?? null])
          ),
        }))
        .toSorted(
          (a, b) =>
            a.last_name.localeCompare(b.last_name) ||
            a.first_name.localeCompare(b.first_name) ||
            a.athlete_id.localeCompare(b.athlete_id)
        ),
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = localOnly();
  if (blocked) return blocked;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const record = body as { clear?: unknown; athlete_id?: unknown; key?: unknown; value?: unknown };
  if (record.clear === true) {
    clearSampleOverrides(id);
    return NextResponse.json({ ok: true });
  }
  if (typeof record.athlete_id !== "string" || typeof record.key !== "string" || !isSampleEditKey(record.key)) {
    return NextResponse.json({ error: "Choose an athlete and a test." }, { status: 400 });
  }
  if (record.value == null || record.value === "") {
    writeSampleOverride(id, record.athlete_id, record.key, null);
    return NextResponse.json({ ok: true });
  }
  const value = typeof record.value === "number" ? record.value : Number(record.value);
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: "Enter a number." }, { status: 400 });
  }
  writeSampleOverride(id, record.athlete_id, record.key, value);
  return NextResponse.json({ ok: true });
}
