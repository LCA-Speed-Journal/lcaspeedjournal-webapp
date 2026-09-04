/**
 * Coach PATCH for Force-to-Form theme-note overrides on a testing-day session.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import {
  coerceThemeNotes,
  mergeThemeNotes,
  parseThemeNotesPatch,
} from "@/lib/norms/f2f/theme-notes";

function isMissingF2fThemeNotesColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = String(e?.message ?? "").toLowerCase();
  return e?.code === "42703" || msg.includes("f2f_theme_notes");
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
  if (typeof rec.session_id !== "string" || !rec.session_id.trim()) {
    return NextResponse.json(
      { error: "Missing required field: session_id" },
      { status: 400 }
    );
  }
  const session_id = rec.session_id.trim();

  const parsed = parseThemeNotesPatch(rec.notes);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const existingResult = await sql`
      SELECT id, f2f_theme_notes
      FROM sessions
      WHERE id = ${session_id}
      LIMIT 1
    `;
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const existingRow = existingResult.rows[0] as { f2f_theme_notes?: unknown };
    const merged = mergeThemeNotes(
      coerceThemeNotes(existingRow.f2f_theme_notes),
      parsed.value
    );

    const { rows } = await sql`
      UPDATE sessions
      SET f2f_theme_notes = ${JSON.stringify(merged)}
      WHERE id = ${session_id}
      RETURNING f2f_theme_notes
    `;
    return NextResponse.json({
      data: coerceThemeNotes((rows[0] as { f2f_theme_notes?: unknown })?.f2f_theme_notes),
    });
  } catch (err) {
    if (isMissingF2fThemeNotesColumn(err)) {
      return NextResponse.json(
        {
          error:
            "f2f_theme_notes column is missing. Run scripts/migrate-f2f-theme-notes.sql.",
        },
        { status: 500 }
      );
    }
    console.error("PATCH /api/reporting/testing-day/f2f-notes:", err);
    return NextResponse.json(
      { error: "Failed to update theme notes" },
      { status: 500 }
    );
  }
}
