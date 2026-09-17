import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { dualWriteWeightRoomJournalFillIfMissing } from "@/lib/norms/weight-room-journal";
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";
import type { ConfirmResultPayload } from "@/lib/weight-room/confirm-scan";
import {
  appendTemplateMovements,
  getTemplateWithMovements,
  isUuid,
  parseMovements,
  serializeDate,
  type MovementInsertInput,
  type WorkoutMovementRow,
} from "@/lib/weight-room/insert-template";
import {
  buildManualLogAthletePayload,
  buildTempIdRemap,
  remapCellKeys,
} from "@/lib/weight-room/manual-log";
import { loadRoster } from "@/lib/weight-room/report-load";

type ManualLogResult = {
  id: string;
  movement_id: string;
  set_index: number;
  raw_text: string | null;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
  corrected: boolean;
};

type ManualLog = {
  id: string;
  athlete_id: string;
  template_id: string;
  scan_id: string | null;
  session_date: string;
  hugo_group: string;
  confirmed_at: string;
  results: ManualLogResult[];
};

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
    return { ok: false, error: "must be an object of strings" };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      return { ok: false, error: "must be an object of strings" };
    }
    out[key] = value;
  }
  return { ok: true, value: out };
}

function serializeConfirmedAt(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function serializeLog(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    athlete_id: String(row.athlete_id),
    template_id: String(row.template_id),
    scan_id: row.scan_id == null ? null : String(row.scan_id),
    session_date: serializeDate(row.session_date),
    hugo_group: String(row.hugo_group),
    confirmed_at: serializeConfirmedAt(row.confirmed_at),
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

function groupLogRows(rows: Record<string, unknown>[]): ManualLog[] {
  const byLogId = new Map<string, ManualLog>();
  const order: string[] = [];

  for (const row of rows) {
    const logId = String(row.log_id);
    let log = byLogId.get(logId);
    if (!log) {
      log = {
        id: logId,
        athlete_id: String(row.athlete_id),
        template_id: String(row.template_id),
        scan_id: row.scan_id == null ? null : String(row.scan_id),
        session_date: serializeDate(row.session_date),
        hugo_group: String(row.hugo_group),
        confirmed_at: serializeConfirmedAt(row.confirmed_at),
        results: [],
      };
      byLogId.set(logId, log);
      order.push(logId);
    }

    if (row.result_id == null) continue;

    log.results.push({
      id: String(row.result_id),
      movement_id: String(row.movement_id),
      set_index: Number(row.set_index),
      raw_text: row.raw_text == null ? null : String(row.raw_text),
      kind: row.kind == null ? null : String(row.kind),
      load: row.load == null ? null : Number(row.load),
      reps: row.reps == null ? null : Number(row.reps),
      units: row.units == null ? null : String(row.units),
      corrected: Boolean(row.corrected),
    });
  }

  return order.map((id) => byLogId.get(id)!);
}

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templateIdRaw = new URL(request.url).searchParams.get("template_id");
  if (!isUuid(templateIdRaw)) {
    return NextResponse.json(
      { error: "Invalid template_id" },
      { status: 400 }
    );
  }
  const templateId = templateIdRaw.trim();

  try {
    const template = await getTemplateWithMovements(templateId);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (!isHugoGroup(template.hugo_group)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }
    const hugoGroup = template.hugo_group as HugoGroup;

    const [roster, logsResult] = await Promise.all([
      loadRoster(hugoGroup),
      sql`
        SELECT
          l.id AS log_id,
          l.athlete_id,
          l.template_id,
          l.scan_id,
          l.session_date,
          l.hugo_group,
          l.confirmed_at,
          r.id AS result_id,
          r.movement_id,
          r.set_index,
          r.raw_text,
          r.kind,
          r.load,
          r.reps,
          r.units,
          r.corrected
        FROM session_logs l
        LEFT JOIN set_results r ON r.session_log_id = l.id
        WHERE l.template_id = ${templateId}
        ORDER BY l.athlete_id, r.set_index
      `,
    ]);

    const logs = groupLogRows(logsResult.rows as Record<string, unknown>[]);

    return NextResponse.json({
      data: { template, roster, logs },
    });
  } catch (err) {
    console.error("GET /api/weight-room/manual-log:", err);
    return NextResponse.json(
      { error: "Failed to load manual log" },
      { status: 500 }
    );
  }
}

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
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!isUuid(body.template_id)) {
      return NextResponse.json(
        { error: "Invalid template_id" },
        { status: 400 }
      );
    }
    const templateId = body.template_id.trim();

    if (!Array.isArray(body.athletes) || body.athletes.length === 0) {
      return NextResponse.json(
        { error: "athletes must be a non-empty array" },
        { status: 400 }
      );
    }

    const defaultsParsed = parseCellsMap(body.defaults);
    if (!defaultsParsed.ok) {
      return NextResponse.json(
        { error: `defaults ${defaultsParsed.error}` },
        { status: 400 }
      );
    }
    const defaults = defaultsParsed.value;

    const athletes: Array<{ athlete_id: string; cells: Record<string, string> }> =
      [];
    for (let i = 0; i < body.athletes.length; i++) {
      const item = body.athletes[i];
      if (!isRecord(item)) {
        return NextResponse.json(
          { error: `athletes[${i}] must be an object` },
          { status: 400 }
        );
      }
      if (!isUuid(item.athlete_id)) {
        return NextResponse.json(
          { error: `athletes[${i}].athlete_id must be a UUID` },
          { status: 400 }
        );
      }
      const cellsParsed = parseCellsMap(item.cells);
      if (!cellsParsed.ok) {
        return NextResponse.json(
          { error: `athletes[${i}].cells ${cellsParsed.error}` },
          { status: 400 }
        );
      }
      athletes.push({
        athlete_id: item.athlete_id.trim(),
        cells: cellsParsed.value,
      });
    }

    let newMovements: MovementInsertInput[] = [];
    const clientTempIds: (string | null)[] = [];
    if ("new_movements" in body && body.new_movements != null) {
      if (!Array.isArray(body.new_movements)) {
        return NextResponse.json(
          { error: "new_movements: movements must be an array" },
          { status: 400 }
        );
      }
      const stripped: unknown[] = [];
      for (let i = 0; i < body.new_movements.length; i++) {
        const item = body.new_movements[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          stripped.push(item);
          clientTempIds.push(null);
          continue;
        }
        const rec = { ...(item as Record<string, unknown>) };
        const rawTemp = rec.client_temp_id;
        delete rec.client_temp_id;
        if (rawTemp === undefined || rawTemp === null) {
          clientTempIds.push(null);
        } else if (typeof rawTemp === "string") {
          clientTempIds.push(rawTemp);
        } else {
          return NextResponse.json(
            {
              error: `new_movements[${i}].client_temp_id must be a string`,
            },
            { status: 400 }
          );
        }
        stripped.push(rec);
      }
      const parsed = parseMovements(stripped);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: `new_movements: ${parsed.error}` },
          { status: 400 }
        );
      }
      newMovements = parsed.value;
    }

    let template = await getTemplateWithMovements(templateId);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    let inserted_movements: WorkoutMovementRow[] = [];
    if (newMovements.length > 0) {
      inserted_movements = await appendTemplateMovements(
        templateId,
        newMovements
      );
      const reloaded = await getTemplateWithMovements(templateId);
      if (!reloaded) {
        return NextResponse.json(
          { error: "Template not found after append" },
          { status: 404 }
        );
      }
      template = reloaded;
    }

    const tempRemap = buildTempIdRemap(
      clientTempIds,
      inserted_movements.map((m) => m.id)
    );
    const remappedDefaults = remapCellKeys(tempRemap, defaults);
    const remappedAthletes = athletes.map((a) => ({
      athleteId: a.athlete_id,
      cells: remapCellKeys(tempRemap, a.cells),
    }));

    const batch = buildManualLogAthletePayload({
      templateId,
      sessionDate: template.session_date,
      hugoGroup: template.hugo_group,
      movements: template.movements.map((m) => ({
        id: m.id,
        set_count: m.set_count,
      })),
      defaults: remappedDefaults,
      athletes: remappedAthletes,
    });

    const logs: ReturnType<typeof serializeLog>[] = [];
    const results_by_athlete: Record<
      string,
      ReturnType<typeof serializeResult>[]
    > = {};
    const journal_warnings: string[] = [];

    for (const item of batch) {
      const logId = crypto.randomUUID();
      const { rows: logRows } = await sql`
        INSERT INTO session_logs (
          id, athlete_id, template_id, scan_id, session_date, hugo_group
        )
        VALUES (
          ${logId},
          ${item.log.athlete_id},
          ${item.log.template_id},
          ${null},
          ${item.log.session_date},
          ${item.log.hugo_group}
        )
        ON CONFLICT (athlete_id, template_id) DO UPDATE SET
          scan_id = COALESCE(session_logs.scan_id, EXCLUDED.scan_id),
          session_date = EXCLUDED.session_date,
          hugo_group = EXCLUDED.hugo_group,
          confirmed_at = NOW()
        RETURNING id, athlete_id, template_id, scan_id, session_date, hugo_group, confirmed_at
      `;
      const log = serializeLog(logRows[0] as Record<string, unknown>);
      logs.push(log);

      const { rows: snapshotRows } = await sql`
        SELECT id, session_log_id, movement_id, set_index, raw_text, kind, load, reps, units, corrected
        FROM set_results
        WHERE session_log_id = ${log.id}
      `;

      await sql`DELETE FROM set_results WHERE session_log_id = ${log.id}`;

      const results: ReturnType<typeof serializeResult>[] = [];
      try {
        for (const result of item.results) {
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
          "POST /api/weight-room/manual-log: set_results insert failed, restoring snapshot",
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
            "POST /api/weight-room/manual-log: failed to restore set_results snapshot",
            errorMessage(restoreErr)
          );
        }
        return NextResponse.json(
          { error: "Failed to save manual log" },
          { status: 500 }
        );
      }

      results_by_athlete[log.athlete_id] = results;

      try {
        const journal = await dualWriteWeightRoomJournalFillIfMissing({
          sessionDate: item.log.session_date,
          athleteId: item.log.athlete_id,
          movements: template.movements,
          outputs: results.map((r) => ({
            movement_id: r.movement_id,
            kind: r.kind ?? "",
            load: r.load,
            units: r.units,
          })),
        });
        journal_warnings.push(...journal.journal_warnings);
      } catch (journalErr) {
        journal_warnings.push(errorMessage(journalErr));
      }
    }

    return NextResponse.json({
      data: {
        logs,
        results_by_athlete,
        journal_warnings,
        inserted_movements,
      },
    });
  } catch (err) {
    console.error("POST /api/weight-room/manual-log:", errorMessage(err));
    return NextResponse.json(
      { error: "Failed to save manual log" },
      { status: 500 }
    );
  }
}
