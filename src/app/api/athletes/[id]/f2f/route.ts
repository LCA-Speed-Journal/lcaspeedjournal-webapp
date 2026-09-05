/**
 * Athlete Force-to-Form — GET (public).
 * Season window: current school year. Modes: full-test | best | latest.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "@/lib/norms/editor-metrics";
import { STANDING_BROAD } from "@/lib/norms/f2f/constants";
import {
  f2fSchoolYearWindow,
  pickF2fMarks,
  type DatedF2fEntry,
  type F2fPickMode,
} from "@/lib/norms/f2f/pick-marks";
import { buildF2fProfile } from "@/lib/norms/f2f/profile";

const MODES: readonly F2fPickMode[] = ["full-test", "best", "latest"];

function parseMode(raw: string | null): F2fPickMode {
  if (raw && (MODES as readonly string[]).includes(raw)) {
    return raw as F2fPickMode;
  }
  return "full-test";
}

function sessionDateString(raw: unknown): string {
  if (typeof raw === "string") return raw.slice(0, 10);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw ?? "").slice(0, 10);
}

function createdAtString(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (raw instanceof Date) return raw.toISOString();
  const text = String(raw);
  return text || undefined;
}

type EntryRow = {
  session_id: string;
  session_date: string | Date;
  created_at?: string | Date | null;
  metric_key: string;
  component: string | null;
  display_value: string | number;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mode = parseMode(new URL(request.url).searchParams.get("mode"));
  const { from, to } = f2fSchoolYearWindow(new Date());

  try {
    const athleteResult = await sql`
      SELECT gender
      FROM athletes
      WHERE id = ${id}
      LIMIT 1
    `;
    if (athleteResult.rows.length === 0) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }
    const gender = (athleteResult.rows[0] as { gender: string | null }).gender;

    const { rows } = await sql`
      SELECT
        e.session_id::text AS session_id,
        s.session_date::text AS session_date,
        e.created_at,
        e.metric_key,
        e.component,
        e.display_value
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      WHERE e.athlete_id = ${id}
        AND e.metric_key IN (${STANDING_BROAD}, ${FORTY_YD_DASH}, ${TWENTY_YD_DASH})
        AND s.session_date >= ${from}::date
        AND s.session_date <= ${to}::date
    `;

    const entries: DatedF2fEntry[] = (rows as EntryRow[]).map((row) => ({
      session_id: String(row.session_id),
      session_date: sessionDateString(row.session_date),
      created_at: createdAtString(row.created_at),
      metric_key: row.metric_key,
      component: row.component,
      display_value: Number(row.display_value),
    }));

    const picked = pickF2fMarks(entries, { mode, from, to });
    try {
      const f2f = buildF2fProfile(picked.entries, { gender });
      return NextResponse.json({
        data: {
          mode: picked.mode,
          composed: picked.composed,
          as_of: picked.as_of,
          f2f,
        },
      });
    } catch {
      return NextResponse.json({
        data: {
          mode: picked.mode,
          composed: picked.composed,
          as_of: picked.as_of,
          f2f: null,
        },
      });
    }
  } catch (err) {
    console.error("GET /api/athletes/[id]/f2f:", err);
    return NextResponse.json(
      { error: "Failed to fetch Force-to-Form" },
      { status: 500 }
    );
  }
}
