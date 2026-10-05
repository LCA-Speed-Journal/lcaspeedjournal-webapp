/**
 * Team Overview API - GET.
 * Gendered Team Leaders (overall + per Hugo team) for current athletes
 * in a date window. Used by TeamOverviewDashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { buildTeamLeaders } from "@/lib/athletes/team-leaders";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { speedJournalSchoolYearRange } from "@/lib/team-progress/date-presets";
import { groupMembershipsByAthleteId } from "@/lib/weight-room/hugo-memberships";

type AthleteRow = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
};

function emptyPayload(from: string, to: string) {
  return {
    from,
    to,
    active_count: 0,
    overall_leaders: [],
    hugo_leaders: [],
    recent_notes: [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    let from: string;
    let to: string;
    if (!fromParam && !toParam) {
      const range = speedJournalSchoolYearRange();
      from = range.from;
      to = range.to;
    } else {
      const parsed = parseReportingDateRange({
        from: fromParam,
        to: toParam,
      });
      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error },
          { status: parsed.status }
        );
      }
      from = parsed.from;
      to = parsed.to;
    }

    let athletes: AthleteRow[] = [];
    try {
      const q = await sql`
        SELECT id::text AS id, first_name, last_name, gender
        FROM athletes
        WHERE active = true AND athlete_type = ${"athlete"}
      `;
      athletes = q.rows as AthleteRow[];
    } catch {
      try {
        const q = await sql`
          SELECT id::text AS id, first_name, last_name, gender
          FROM athletes
          WHERE active = true
        `;
        athletes = q.rows as AthleteRow[];
      } catch {
        const q = await sql`
          SELECT id::text AS id, first_name, last_name, gender
          FROM athletes
        `;
        athletes = q.rows as AthleteRow[];
      }
    }

    const ids = athletes.map((a) => a.id);
    if (ids.length === 0) {
      return NextResponse.json({ data: emptyPayload(from, to) });
    }

    const membershipsById = new Map<string, string[]>();
    try {
      const mem = await sql`
        SELECT athlete_id::text AS athlete_id, hugo_group
        FROM athlete_hugo_memberships
        WHERE athlete_id = ANY(${ids as unknown as string}::uuid[])
      `;
      const grouped = groupMembershipsByAthleteId(
        mem.rows as { athlete_id: string; hugo_group: string }[]
      );
      for (const [id, groups] of grouped) membershipsById.set(id, groups);
    } catch {
      // memberships table may not exist
    }

    const leaderAthletes = athletes.map((a) => ({
      id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
      gender: a.gender,
      hugo_groups: membershipsById.get(a.id) ?? [],
    }));

    let entries: {
      athlete_id: string;
      metric_key: string;
      component: string | null;
      display_value: number;
      units: string;
    }[] = [];
    try {
      const entriesRows = await sql`
        SELECT
          e.athlete_id::text AS athlete_id,
          e.metric_key,
          e.component,
          e.display_value,
          e.units
        FROM entries e
        INNER JOIN sessions s ON s.id = e.session_id
        WHERE e.athlete_id = ANY(${ids as unknown as string}::uuid[])
          AND s.session_date >= ${from}::date
          AND s.session_date <= ${to}::date
          AND e.display_value IS NOT NULL
      `;
      entries = (entriesRows.rows as Record<string, unknown>[]).map((r) => ({
        athlete_id: String(r.athlete_id),
        metric_key: String(r.metric_key),
        component: r.component == null ? null : String(r.component),
        display_value: Number(r.display_value),
        units: r.units == null ? "" : String(r.units),
      }));
    } catch {
      // entries/sessions may fail
    }

    const { overall, hugo } = buildTeamLeaders({
      athletes: leaderAthletes,
      entries,
    });

    let recentNotes: {
      athlete_id: string;
      first_name: string;
      last_name: string;
      note_preview: string;
      created_at: string;
    }[] = [];
    try {
      const notesRows = await sql`
        SELECT n.athlete_id, n.note_text, n.created_at, a.first_name, a.last_name
        FROM athlete_notes n
        JOIN athletes a ON a.id = n.athlete_id
        WHERE n.athlete_id = ANY(${ids as unknown as string}::uuid[])
        ORDER BY n.created_at DESC
        LIMIT 10
      `;
      recentNotes = (
        notesRows.rows as {
          athlete_id: string;
          note_text: string;
          created_at: string;
          first_name: string;
          last_name: string;
        }[]
      ).map((n) => ({
        athlete_id: n.athlete_id,
        first_name: n.first_name,
        last_name: n.last_name,
        note_preview:
          n.note_text.length > 120
            ? n.note_text.slice(0, 120) + "…"
            : n.note_text,
        created_at: n.created_at,
      }));
    } catch {
      // athlete_notes may not exist
    }

    return NextResponse.json({
      data: {
        from,
        to,
        active_count: ids.length,
        overall_leaders: overall,
        hugo_leaders: hugo,
        recent_notes: recentNotes,
      },
    });
  } catch (err) {
    console.error("GET /api/team-overview:", err);
    return NextResponse.json(
      { error: "Failed to fetch team overview" },
      { status: 500 }
    );
  }
}
