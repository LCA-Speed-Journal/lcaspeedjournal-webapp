import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { getTemplateWithMovements, isUuid } from "@/lib/weight-room/insert-template";
import { mergeExtractionCells } from "@/lib/weight-room/confirm-scan";
import {
  loadScanRow,
  serializeScan,
  sessionLogExists,
} from "@/lib/weight-room/scan-row";
import type { ScanStatus } from "@/lib/weight-room/constants";

const EDITABLE_STATUSES: readonly ScanStatus[] = [
  "uploaded",
  "needs_review",
  "unmatched",
];

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Request failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCellsMap(
  raw: unknown
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: "cells must be an object of strings" };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      return { ok: false, error: "cells must be an object of strings" };
    }
    out[key] = value;
  }
  return { ok: true, value: out };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await params;
  if (!isUuid(rawId)) {
    return NextResponse.json({ error: "Invalid scan id" }, { status: 400 });
  }
  const id = rawId.trim();

  try {
    const row = await loadScanRow(id);
    if (!row) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    const scan = serializeScan(row);
    const template = scan.template_id
      ? await getTemplateWithMovements(scan.template_id)
      : null;
    const duplicate_warning = await sessionLogExists(
      scan.athlete_id,
      scan.template_id
    );
    return NextResponse.json({
      data: { scan, template, duplicate_warning },
    });
  } catch (err) {
    console.error("GET /api/weight-room/scans/[id]:", errorMessage(err));
    return NextResponse.json({ error: "Failed to fetch scan" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await params;
  if (!isUuid(rawId)) {
    return NextResponse.json({ error: "Invalid scan id" }, { status: 400 });
  }
  const id = rawId.trim();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const row = await loadScanRow(id);
    if (!row) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    const current = serializeScan(row);
    const status = current.status as ScanStatus;

    if (status === "confirmed") {
      return NextResponse.json(
        { error: "Confirmed scans cannot be edited. Upload a new scan for this athlete and card to overwrite the log." },
        { status: 409 }
      );
    }

    let nextAthleteId = current.athlete_id;
    let nextExtraction = current.extraction;
    let nextStatus: ScanStatus = status;
    let hasField = false;

    if ("athlete_id" in body) {
      hasField = true;
      if (body.athlete_id === null || body.athlete_id === "") {
        nextAthleteId = null;
      } else if (typeof body.athlete_id === "string" && isUuid(body.athlete_id)) {
        nextAthleteId = body.athlete_id.trim();
      } else {
        return NextResponse.json(
          { error: "athlete_id must be a UUID or null" },
          { status: 400 }
        );
      }
    }

    let incomingCells: Record<string, string> | undefined;
    if ("cells" in body) {
      const parsed = parseCellsMap(body.cells);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      incomingCells = parsed.value;
      hasField = true;
    } else if ("extraction" in body) {
      if (!isRecord(body.extraction)) {
        return NextResponse.json(
          { error: "extraction must be an object" },
          { status: 400 }
        );
      }
      const parsed = parseCellsMap(body.extraction.cells);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      incomingCells = parsed.value;
      hasField = true;
    }

    if ("status" in body) {
      if (body.status !== "rejected") {
        return NextResponse.json(
          { error: "status can only be set to rejected" },
          { status: 400 }
        );
      }
      nextStatus = "rejected";
      hasField = true;
    }

    if (!hasField) {
      return NextResponse.json(
        { error: "Provide athlete_id, cells, and/or status" },
        { status: 400 }
      );
    }

    const editingContent =
      "athlete_id" in body || incomingCells !== undefined;
    if (
      editingContent &&
      !EDITABLE_STATUSES.includes(status)
    ) {
      return NextResponse.json(
        { error: "Cannot edit athlete or cells unless the scan is awaiting review" },
        { status: 409 }
      );
    }

    if (incomingCells) {
      nextExtraction = mergeExtractionCells(current.extraction, incomingCells);
    }

    const extractionJson =
      nextExtraction == null ? null : JSON.stringify(nextExtraction);

    const { rows } = await sql`
      UPDATE card_scans
      SET
        athlete_id = ${nextAthleteId},
        extraction = ${extractionJson},
        status = ${nextStatus}
      WHERE id = ${id}
      RETURNING
        id, blob_url, template_id, athlete_id, sticker_payload, status, extraction, error, uploaded_at
    `;
    const updated = serializeScan(rows[0] as Record<string, unknown>);
    const template = updated.template_id
      ? await getTemplateWithMovements(updated.template_id)
      : null;
    const duplicate_warning = await sessionLogExists(
      updated.athlete_id,
      updated.template_id
    );
    return NextResponse.json({
      data: { scan: updated, template, duplicate_warning },
    });
  } catch (err) {
    console.error("PATCH /api/weight-room/scans/[id]:", errorMessage(err));
    return NextResponse.json({ error: "Failed to update scan" }, { status: 500 });
  }
}
