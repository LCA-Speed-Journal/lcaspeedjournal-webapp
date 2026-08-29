import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import extraSessionsJson from "@/lib/weight-room/extracurricular-sessions.json";
import {
  assignTermDates,
  extraSessionToDraft,
  type ExtraSessionJson,
} from "@/lib/weight-room/from-extra-json";
import {
  insertTemplateWithMovements,
  isIsoCalendarDate,
  serializeDate,
  templateFromDraft,
} from "@/lib/weight-room/insert-template";

const extraSessions = extraSessionsJson as ExtraSessionJson[];

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

    const termStart =
      body && typeof body === "object" && "term_start" in body
        ? (body as { term_start: unknown }).term_start
        : undefined;

    if (!isIsoCalendarDate(termStart)) {
      return NextResponse.json(
        { error: "term_start must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const drafts = assignTermDates(
      extraSessions.map((session) => extraSessionToDraft(session)),
      termStart.trim()
    );

    if (drafts.length === 0) {
      return NextResponse.json({ data: { inserted: 0, skipped: 0 } });
    }

    const dates = drafts.map((d) => d.sessionDate);
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));

    const { rows: existingRows } = await sql`
      SELECT session_date
      FROM workout_templates
      WHERE hugo_group = 'extracurricular'
        AND session_date >= ${minDate}
        AND session_date <= ${maxDate}
    `;
    const existingDates = new Set(
      (existingRows as Record<string, unknown>[]).map((r) =>
        serializeDate(r.session_date)
      )
    );

    let inserted = 0;
    let skipped = 0;
    for (const draft of drafts) {
      if (existingDates.has(draft.sessionDate)) {
        skipped += 1;
        continue;
      }
      if (draft.movements.length === 0) {
        skipped += 1;
        continue;
      }
      await insertTemplateWithMovements(templateFromDraft(draft));
      existingDates.add(draft.sessionDate);
      inserted += 1;
    }

    return NextResponse.json({ data: { inserted, skipped } });
  } catch (err) {
    console.error("POST /api/weight-room/templates/seed-extra:", err);
    return NextResponse.json(
      { error: "Failed to seed extracurricular templates" },
      { status: 500 }
    );
  }
}
