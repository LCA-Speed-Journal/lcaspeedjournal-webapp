import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";
import {
  getTemplateWithMovements,
  isUuid,
  serializeDate,
} from "@/lib/weight-room/insert-template";
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

function serializeConfirmedAt(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
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
