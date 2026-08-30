import { sql } from "@/lib/db";
import {
  normalizeTargets,
  serializeDate,
} from "@/lib/weight-room/insert-template";
import type {
  ReportAggregateInput,
  ReportAthlete,
  ReportLog,
  ReportMovement,
  ReportResult,
} from "@/lib/weight-room/report-aggregate";
import { priorWeekRange } from "@/lib/weight-room/report-aggregate";
import type { HugoGroup } from "@/lib/weight-room/constants";

export type ReportSource = Pick<
  ReportAggregateInput,
  "logs" | "results" | "movements" | "athletes"
>;

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function rowsToReportSource(rows: Record<string, unknown>[]): ReportSource {
  const logs: ReportLog[] = [];
  const logSeen = new Set<string>();
  const athletes: ReportAthlete[] = [];
  const athleteSeen = new Set<string>();
  const movements: ReportMovement[] = [];
  const movementSeen = new Set<string>();
  const results: ReportResult[] = [];

  for (const row of rows) {
    const logId = String(row.log_id);
    if (!logSeen.has(logId)) {
      logSeen.add(logId);
      logs.push({
        id: logId,
        athlete_id: String(row.athlete_id),
        template_id: String(row.template_id),
        session_date: serializeDate(row.session_date),
        hugo_group: String(row.hugo_group),
      });
    }

    const athleteId = String(row.athlete_id);
    if (!athleteSeen.has(athleteId)) {
      athleteSeen.add(athleteId);
      athletes.push({
        id: athleteId,
        first_name: String(row.first_name ?? ""),
        last_name: String(row.last_name ?? ""),
      });
    }

    if (row.movement_id != null) {
      const mid = String(row.movement_id);
      if (!movementSeen.has(mid)) {
        movementSeen.add(mid);
        movements.push({
          id: mid,
          name: String(row.movement_name ?? ""),
          targets: normalizeTargets(row.targets),
        });
      }
    }

    if (row.result_id != null) {
      results.push({
        session_log_id: String(row.session_log_id ?? logId),
        movement_id: String(row.movement_id),
        raw_text: row.raw_text == null ? null : String(row.raw_text),
        kind: row.kind == null ? null : String(row.kind),
        load: toNum(row.load),
        reps: toNum(row.reps),
        units: row.units == null ? null : String(row.units),
      });
    }
  }

  return { logs, results, movements, athletes };
}

export async function loadRoster(hugo_group: HugoGroup): Promise<ReportAthlete[]> {
  const { rows } = await sql`
    SELECT
      a.id,
      a.first_name,
      a.last_name
    FROM athlete_hugo_memberships m
    JOIN athletes a ON a.id = m.athlete_id
    WHERE m.hugo_group = ${hugo_group} AND a.active = true
    ORDER BY a.last_name, a.first_name
  `;
  return (rows as Array<{ id: string; first_name: string; last_name: string }>).map(
    (row) => ({
      id: String(row.id),
      first_name: String(row.first_name ?? ""),
      last_name: String(row.last_name ?? ""),
    })
  );
}

export async function loadTeamReportSource(opts: {
  hugo_group: string;
  from: string;
  to: string;
}): Promise<ReportSource> {
  const { rows } = await sql`
    SELECT
      l.id AS log_id,
      l.athlete_id,
      l.template_id,
      l.session_date,
      l.hugo_group,
      a.first_name,
      a.last_name,
      r.id AS result_id,
      r.session_log_id,
      r.movement_id,
      r.raw_text,
      r.kind,
      r.load,
      r.reps,
      r.units,
      m.name AS movement_name,
      m.targets
    FROM session_logs l
    INNER JOIN athletes a ON a.id = l.athlete_id
    LEFT JOIN set_results r ON r.session_log_id = l.id
    LEFT JOIN workout_movements m ON m.id = r.movement_id
    WHERE l.hugo_group = ${opts.hugo_group}
      AND l.session_date BETWEEN ${opts.from}::date AND ${opts.to}::date
    ORDER BY a.last_name, a.first_name, l.session_date, r.set_index
  `;
  return rowsToReportSource(rows as Record<string, unknown>[]);
}

export async function loadAthleteReportSource(opts: {
  athlete_id: string;
  from: string;
  to: string;
}): Promise<ReportSource> {
  const { rows } = await sql`
    SELECT
      l.id AS log_id,
      l.athlete_id,
      l.template_id,
      l.session_date,
      l.hugo_group,
      a.first_name,
      a.last_name,
      r.id AS result_id,
      r.session_log_id,
      r.movement_id,
      r.raw_text,
      r.kind,
      r.load,
      r.reps,
      r.units,
      m.name AS movement_name,
      m.targets
    FROM session_logs l
    INNER JOIN athletes a ON a.id = l.athlete_id
    LEFT JOIN set_results r ON r.session_log_id = l.id
    LEFT JOIN workout_movements m ON m.id = r.movement_id
    WHERE l.athlete_id = ${opts.athlete_id}::uuid
      AND l.session_date BETWEEN ${opts.from}::date AND ${opts.to}::date
    ORDER BY l.session_date, r.set_index
  `;
  return rowsToReportSource(rows as Record<string, unknown>[]);
}

export async function loadTeamAggregateInput(opts: {
  hugo_group: HugoGroup;
  from: string;
  to: string;
}): Promise<ReportAggregateInput> {
  const prior = priorWeekRange(opts.from);
  const [current, previous] = await Promise.all([
    loadTeamReportSource(opts),
    loadTeamReportSource({
      hugo_group: opts.hugo_group,
      from: prior.from,
      to: prior.to,
    }),
  ]);
  return {
    hugo_group: opts.hugo_group,
    from: opts.from,
    to: opts.to,
    ...current,
    priorLogs: previous.logs,
    priorResults: previous.results,
  };
}

export async function loadAthleteAggregateInput(opts: {
  hugo_group: HugoGroup;
  athlete_id: string;
  from: string;
  to: string;
}): Promise<ReportAggregateInput> {
  const prior = priorWeekRange(opts.from);
  const [current, previous] = await Promise.all([
    loadAthleteReportSource(opts),
    loadAthleteReportSource({
      athlete_id: opts.athlete_id,
      from: prior.from,
      to: prior.to,
    }),
  ]);
  return {
    hugo_group: opts.hugo_group,
    from: opts.from,
    to: opts.to,
    ...current,
    priorLogs: previous.logs,
    priorResults: previous.results,
  };
}
