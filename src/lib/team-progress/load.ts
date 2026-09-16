import { sql } from "@/lib/db";
import { serializeDate } from "@/lib/weight-room/insert-template";
import type { HugoGroup } from "@/lib/weight-room/constants";
import { STANDING_BROAD } from "@/lib/norms/f2f/constants";
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "@/lib/norms/editor-metrics";
import type { TestEntryRow } from "./test-aggregate";
import type { LiftLogRow } from "./lift-aggregate";
import type { IsoTemplateRow } from "./iso-rocks";
import type { F2fAthleteRow, F2fEntryWithAthlete } from "./f2f-aggregate";

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type TeamProgressRosterAthlete = F2fAthleteRow;

export async function loadTeamProgressRoster(
  hugoGroup: HugoGroup
): Promise<TeamProgressRosterAthlete[]> {
  const { rows } = await sql`
    SELECT
      a.id::text AS id,
      a.first_name,
      a.last_name,
      a.gender
    FROM athlete_hugo_memberships m
    JOIN athletes a ON a.id = m.athlete_id
    WHERE m.hugo_group = ${hugoGroup} AND a.active = true
    ORDER BY a.last_name, a.first_name
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    first_name: String(r.first_name ?? ""),
    last_name: String(r.last_name ?? ""),
    gender: r.gender == null ? null : String(r.gender),
  }));
}

export async function loadTeamProgressTestEntries(opts: {
  athleteIds: string[];
  from: string;
  to: string;
}): Promise<TestEntryRow[]> {
  if (opts.athleteIds.length === 0) return [];
  const { rows } = await sql`
    SELECT
      e.athlete_id::text AS athlete_id,
      s.session_date::text AS session_date,
      e.metric_key,
      e.component,
      e.display_value,
      e.units
    FROM entries e
    INNER JOIN sessions s ON s.id = e.session_id
    WHERE e.athlete_id = ANY(${opts.athleteIds as unknown as string}::uuid[])
      AND s.session_date >= ${opts.from}::date
      AND s.session_date <= ${opts.to}::date
      AND e.display_value IS NOT NULL
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    athlete_id: String(r.athlete_id),
    session_date: String(r.session_date).slice(0, 10),
    metric_key: String(r.metric_key),
    component: r.component == null ? null : String(r.component),
    display_value: Number(r.display_value),
    units: r.units == null ? null : String(r.units),
  }));
}

export async function loadTeamProgressF2fEntries(opts: {
  athleteIds: string[];
  from: string;
  to: string;
}): Promise<F2fEntryWithAthlete[]> {
  if (opts.athleteIds.length === 0) return [];
  const { rows } = await sql`
    SELECT
      e.athlete_id::text AS athlete_id,
      e.session_id::text AS session_id,
      s.session_date::text AS session_date,
      e.metric_key,
      e.component,
      e.display_value
    FROM entries e
    INNER JOIN sessions s ON s.id = e.session_id
    WHERE e.athlete_id = ANY(${opts.athleteIds as unknown as string}::uuid[])
      AND s.session_date >= ${opts.from}::date
      AND s.session_date <= ${opts.to}::date
      AND e.metric_key IN (${STANDING_BROAD}, ${FORTY_YD_DASH}, ${TWENTY_YD_DASH})
      AND e.display_value IS NOT NULL
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    athlete_id: String(r.athlete_id),
    session_id: String(r.session_id),
    session_date: String(r.session_date).slice(0, 10),
    metric_key: String(r.metric_key),
    component: r.component == null ? null : String(r.component),
    display_value: Number(r.display_value),
  }));
}

export async function loadTeamProgressLiftRows(opts: {
  hugoGroup: HugoGroup;
  from: string;
  to: string;
}): Promise<LiftLogRow[]> {
  const { rows } = await sql`
    SELECT
      l.athlete_id::text AS athlete_id,
      l.session_date,
      m.name AS movement_name,
      r.kind,
      r.load
    FROM session_logs l
    INNER JOIN set_results r ON r.session_log_id = l.id
    INNER JOIN workout_movements m ON m.id = r.movement_id
    WHERE l.hugo_group = ${opts.hugoGroup}
      AND l.session_date >= ${opts.from}::date
      AND l.session_date <= ${opts.to}::date
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    athlete_id: String(r.athlete_id),
    session_date: serializeDate(r.session_date),
    movement_name: String(r.movement_name ?? ""),
    kind: r.kind == null ? null : String(r.kind),
    load: toNum(r.load),
  }));
}

export async function loadTeamProgressIsoTemplates(opts: {
  hugoGroup: HugoGroup;
  from: string;
  to: string;
}): Promise<IsoTemplateRow[]> {
  const { rows } = await sql`
    SELECT
      t.session_date,
      m.name AS movement_name,
      m.notes,
      m.targets
    FROM workout_templates t
    INNER JOIN workout_movements m ON m.template_id = t.id
    WHERE t.hugo_group = ${opts.hugoGroup}
      AND t.session_date >= ${opts.from}::date
      AND t.session_date <= ${opts.to}::date
  `;
  return (rows as Record<string, unknown>[]).map((r) => {
    let targets: string[] = [];
    const raw = r.targets;
    if (Array.isArray(raw)) {
      targets = raw.map(String);
    } else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) targets = parsed.map(String);
      } catch {
        targets = [];
      }
    }
    return {
      session_date: serializeDate(r.session_date),
      movement_name: String(r.movement_name ?? ""),
      notes: r.notes == null ? null : String(r.notes),
      targets,
    };
  });
}
