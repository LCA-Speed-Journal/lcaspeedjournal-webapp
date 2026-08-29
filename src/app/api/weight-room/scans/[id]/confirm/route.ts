import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import {
  getTemplateWithMovements,
  isUuid,
  serializeDate,
} from "@/lib/weight-room/insert-template";
import {
  buildConfirmPayload,
  mergeExtractionCells,
  parseScanExtraction,
  type ConfirmResultPayload,
} from "@/lib/weight-room/confirm-scan";
import { loadScanRow, serializeScan } from "@/lib/weight-room/scan-row";

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

function serializeLog(row: Record<string, unknown>) {
  const confirmedAt = row.confirmed_at;
  return {
    id: String(row.id),
    athlete_id: String(row.athlete_id),
    template_id: String(row.template_id),
    scan_id: row.scan_id == null ? null : String(row.scan_id),
    session_date: serializeDate(row.session_date),
    hugo_group: String(row.hugo_group),
    confirmed_at:
      confirmedAt instanceof Date
        ? confirmedAt.toISOString()
        : String(confirmedAt ?? ""),
  };
}

function serializeResult(
  row: Record<string, unknown>,
  fallback: ConfirmResultPayload
) {
  return {
    id: String(row.id),
    session_log_id: String(row.session_log_id),
    movement_id: String(row.movement_id),
    set_index: Number(row.set_index),
    raw_text: row.raw_text == null ? null : String(row.raw_text),
    kind: row.kind == null ? null : String(row.kind),
    load: row.load == null ? null : Number(row.load),
    reps: row.reps == null ? null : Number(row.reps),
    units: row.units == null ? null : String(row.units),
    corrected: Boolean(row.corrected ?? fallback.corrected),
  };
}

export async function POST(
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
  const scanId = rawId.trim();

  try {
    let body: unknown = {};
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }
    if (body !== undefined && body !== null && !isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const rec = isRecord(body) ? body : {};

    const row = await loadScanRow(scanId);
    if (!row) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    const scan = serializeScan(row);

    if (
      scan.status !== "uploaded" &&
      scan.status !== "needs_review" &&
      scan.status !== "unmatched"
    ) {
      return NextResponse.json(
        { error: "Scan cannot be confirmed" },
        { status: 409 }
      );
    }

    let athleteId = scan.athlete_id;
    if ("athlete_id" in rec) {
      if (typeof rec.athlete_id === "string" && isUuid(rec.athlete_id)) {
        athleteId = rec.athlete_id.trim();
      } else if (rec.athlete_id === null || rec.athlete_id === "") {
        athleteId = null;
      } else {
        return NextResponse.json(
          { error: "athlete_id must be a UUID" },
          { status: 400 }
        );
      }
    }

    if (!scan.template_id) {
      return NextResponse.json(
        { error: "template_id is required" },
        { status: 400 }
      );
    }

    const template = await getTemplateWithMovements(scan.template_id);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 400 }
      );
    }

    let editedCells = parseScanExtraction(scan.extraction).cells;
    if ("cells" in rec) {
      const parsed = parseCellsMap(rec.cells);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      editedCells = { ...editedCells, ...parsed.value };
    }

    const payload = buildConfirmPayload({
      scan: {
        id: scan.id,
        athlete_id: athleteId,
        template_id: scan.template_id,
        extraction: scan.extraction,
        status: scan.status,
      },
      template,
      editedCells,
    });
    if (!payload.ok) {
      return NextResponse.json({ error: payload.error }, { status: 400 });
    }

    const logId = crypto.randomUUID();
    const { rows: logRows } = await sql`
      INSERT INTO session_logs (
        id, athlete_id, template_id, scan_id, session_date, hugo_group
      )
      VALUES (
        ${logId},
        ${payload.log.athlete_id},
        ${payload.log.template_id},
        ${scan.id},
        ${payload.log.session_date},
        ${payload.log.hugo_group}
      )
      ON CONFLICT (athlete_id, template_id) DO UPDATE SET
        scan_id = EXCLUDED.scan_id,
        session_date = EXCLUDED.session_date,
        hugo_group = EXCLUDED.hugo_group,
        confirmed_at = NOW()
      RETURNING id, athlete_id, template_id, scan_id, session_date, hugo_group, confirmed_at
    `;
    const log = serializeLog(logRows[0] as Record<string, unknown>);

    const { rows: snapshotRows } = await sql`
      SELECT id, session_log_id, movement_id, set_index, raw_text, kind, load, reps, units, corrected
      FROM set_results
      WHERE session_log_id = ${log.id}
    `;

    await sql`DELETE FROM set_results WHERE session_log_id = ${log.id}`;

    let results: ReturnType<typeof serializeResult>[] = [];
    try {
      for (const result of payload.results) {
        const resultId = crypto.randomUUID();
        const { rows: resultRows } = await sql`
          INSERT INTO set_results (
            id, session_log_id, movement_id, set_index, raw_text, kind, load, reps, units, corrected
          )
          VALUES (
            ${resultId},
            ${log.id},
            ${result.movement_id},
            ${result.set_index},
            ${result.raw_text},
            ${result.kind},
            ${result.load},
            ${result.reps},
            ${result.units},
            ${result.corrected}
          )
          RETURNING id, session_log_id, movement_id, set_index, raw_text, kind, load, reps, units, corrected
        `;
        results.push(
          serializeResult(resultRows[0] as Record<string, unknown>, result)
        );
      }
    } catch (insertErr) {
      console.error(
        "POST /api/weight-room/scans/[id]/confirm: set_results insert failed, restoring snapshot",
        errorMessage(insertErr)
      );
      try {
        await sql`DELETE FROM set_results WHERE session_log_id = ${log.id}`;
        for (const snap of snapshotRows as Record<string, unknown>[]) {
          await sql`
            INSERT INTO set_results (
              id, session_log_id, movement_id, set_index, raw_text, kind, load, reps, units, corrected
            )
            VALUES (
              ${String(snap.id)},
              ${String(snap.session_log_id)},
              ${String(snap.movement_id)},
              ${Number(snap.set_index)},
              ${snap.raw_text == null ? null : String(snap.raw_text)},
              ${snap.kind == null ? null : String(snap.kind)},
              ${snap.load == null ? null : Number(snap.load)},
              ${snap.reps == null ? null : Number(snap.reps)},
              ${snap.units == null ? null : String(snap.units)},
              ${Boolean(snap.corrected)}
            )
          `;
        }
      } catch (restoreErr) {
        console.error(
          "POST /api/weight-room/scans/[id]/confirm: failed to restore set_results snapshot",
          errorMessage(restoreErr)
        );
      }
      return NextResponse.json(
        { error: "Failed to confirm scan" },
        { status: 500 }
      );
    }

    const nextExtraction = mergeExtractionCells(scan.extraction, editedCells);
    const extractionJson = JSON.stringify(nextExtraction);

    await sql`
      UPDATE card_scans
      SET
        status = ${"confirmed"},
        athlete_id = ${payload.log.athlete_id},
        extraction = ${extractionJson}
      WHERE id = ${scan.id}
    `;

    return NextResponse.json({ data: { log, results } });
  } catch (err) {
    console.error("POST /api/weight-room/scans/[id]/confirm:", errorMessage(err));
    return NextResponse.json(
      { error: "Failed to confirm scan" },
      { status: 500 }
    );
  }
}
