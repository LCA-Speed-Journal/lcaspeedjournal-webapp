import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { parseWorkoutCsv } from "@/lib/weight-room/csv-import";
import {
  insertTemplateWithMovements,
  parseTemplatePayload,
  serializeTemplateRow,
  validateCsvImportTemplates,
} from "@/lib/weight-room/insert-template";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const hugoGroupRaw = searchParams.get("hugo_group");
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");

    let hugoGroup: string | null = null;
    if (searchParams.has("hugo_group")) {
      if (!isHugoGroup(hugoGroupRaw)) {
        return NextResponse.json(
          { error: "Invalid hugo_group" },
          { status: 400 }
        );
      }
      hugoGroup = hugoGroupRaw;
    }

    let from: string | null = null;
    let to: string | null = null;
    if (fromRaw != null || toRaw != null) {
      const parsed = parseReportingDateRange({ from: fromRaw, to: toRaw });
      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error },
          { status: parsed.status }
        );
      }
      from = parsed.from;
      to = parsed.to;
    }

    const { rows } = await sql`
      SELECT
        t.id,
        t.hugo_group,
        t.week_number,
        t.day_name,
        t.session_date,
        t.focus,
        t.title,
        t.layout,
        t.created_at,
        (SELECT COUNT(*)::int FROM workout_movements m WHERE m.template_id = t.id) AS movement_count
      FROM workout_templates t
      WHERE (${hugoGroup}::text IS NULL OR t.hugo_group = ${hugoGroup})
        AND (${from}::date IS NULL OR t.session_date >= ${from}::date)
        AND (${to}::date IS NULL OR t.session_date <= ${to}::date)
      ORDER BY t.session_date, t.hugo_group
    `;

    const templates = (rows as Record<string, unknown>[]).map(
      serializeTemplateRow
    );
    return NextResponse.json({ data: templates });
  } catch (err) {
    console.error("GET /api/weight-room/templates:", err);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
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

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const rec = body as Record<string, unknown>;

    if ("csv" in rec) {
      if (typeof rec.csv !== "string") {
        return NextResponse.json(
          { error: "csv must be a string" },
          { status: 400 }
        );
      }
      const parsed = parseWorkoutCsv(rec.csv);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      const ready = validateCsvImportTemplates(parsed.templates);
      const inserted = [];
      for (const template of ready.templates) {
        inserted.push(await insertTemplateWithMovements(template));
      }
      return NextResponse.json(
        {
          data: {
            templates: inserted,
            errors: [...parsed.errors, ...ready.errors],
          },
        },
        { status: 201 }
      );
    }

    if ("template" in rec) {
      const parsed = parseTemplatePayload(rec.template);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const template = await insertTemplateWithMovements(parsed.value);
      return NextResponse.json({ data: template }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Body must include csv or template" },
      { status: 400 }
    );
  } catch (err) {
    console.error("POST /api/weight-room/templates:", err);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
