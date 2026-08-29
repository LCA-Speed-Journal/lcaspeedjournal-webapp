import type { HugoGroup } from "./constants";

export type ReportLog = {
  id: string;
  athlete_id: string;
  template_id: string;
  session_date: string;
  hugo_group: string;
};

export type ReportResult = {
  session_log_id: string;
  movement_id: string;
  raw_text: string | null;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
};

export type ReportMovement = {
  id: string;
  name: string;
  targets?: string[] | null;
};

export type ReportAthlete = {
  id: string;
  first_name: string;
  last_name: string;
};

export type ReportAggregateInput = {
  logs: ReportLog[];
  results: ReportResult[];
  movements: ReportMovement[];
  athletes: ReportAthlete[];
  from: string;
  to: string;
  hugo_group: HugoGroup;
  priorResults?: ReportResult[];
  priorLogs?: ReportLog[];
};

export type ReportOutputRow = {
  movement_name: string;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
  raw_text: string | null;
  session_date: string;
};

export type AthleteDateRow = {
  session_date: string;
  setsLogged: number;
  parsedVolume: number;
  bestLoad: number | null;
};

export type AthleteReportRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  daysPresent: number;
  movementsTrained: string[];
  setsLogged: number;
  parsedVolume: number;
  bestLoad: number | null;
  priorWeekBestLoad: number | null;
  outputs: ReportOutputRow[];
  byDate: AthleteDateRow[];
};

export type WeightRoomReport = {
  hugo_group: HugoGroup;
  from: string;
  to: string;
  sessionDates: string[];
  attendanceByDate: { session_date: string; count: number }[];
  athletes: AthleteReportRow[];
};

const OUTPUT_HINT = /\bCMJ\b|\b(?:\d+)?RM\b|\btest\b/i;
const VOLUME_KINDS = new Set(["load_reps", "amrap"]);

export const MAX_WEIGHT_ROOM_REPORT_DAYS = 84;
export const WEIGHT_ROOM_REPORT_RANGE_ERROR =
  "Date range too long: maximum 12 weeks (84 days)";

export function priorWeekRange(from: string): { from: string; to: string } {
  const start = new Date(`${from}T12:00:00.000Z`);
  const priorTo = new Date(start);
  priorTo.setUTCDate(priorTo.getUTCDate() - 1);
  const priorFrom = new Date(start);
  priorFrom.setUTCDate(priorFrom.getUTCDate() - 7);
  return {
    from: priorFrom.toISOString().slice(0, 10),
    to: priorTo.toISOString().slice(0, 10),
  };
}

/** True when inclusive UTC day span exceeds 12 weeks. from/to are YYYY-MM-DD. */
export function isWeightRoomReportRangeTooLong(from: string, to: string): boolean {
  const fromD = new Date(`${from}T12:00:00.000Z`);
  const toD = new Date(`${to}T12:00:00.000Z`);
  const days = (toD.getTime() - fromD.getTime()) / 86_400_000;
  return days > MAX_WEIGHT_ROOM_REPORT_DAYS;
}

function hasLoggedText(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

function asNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

function isOutputResult(row: ReportResult, movement: ReportMovement | undefined): boolean {
  if (row.kind === "output") return true;
  const name = movement?.name ?? "";
  const targets = (movement?.targets ?? []).join(" ");
  return OUTPUT_HINT.test(name) || OUTPUT_HINT.test(targets);
}

function maxLoad(results: ReportResult[]): number | null {
  let best: number | null = null;
  for (const row of results) {
    if (row.kind !== "load_reps" || !hasLoggedText(row.raw_text)) continue;
    const load = asNumber(row.load);
    if (load == null) continue;
    if (best == null || load > best) best = load;
  }
  return best;
}

function parsedVolumeOf(results: ReportResult[]): number {
  let total = 0;
  for (const row of results) {
    if (!hasLoggedText(row.raw_text)) continue;
    if (!row.kind || !VOLUME_KINDS.has(row.kind)) continue;
    const reps = asNumber(row.reps);
    if (reps == null) continue;
    total += reps;
  }
  return total;
}

function setsLoggedOf(results: ReportResult[]): number {
  let count = 0;
  for (const row of results) {
    if (hasLoggedText(row.raw_text)) count += 1;
  }
  return count;
}

export function aggregateWeightRoomReport(
  input: ReportAggregateInput
): WeightRoomReport {
  const logs = input.logs ?? [];
  const results = input.results ?? [];
  const movements = input.movements ?? [];
  const athletes = input.athletes ?? [];

  const movementById = new Map(movements.map((m) => [m.id, m]));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const resultsByLog = new Map<string, ReportResult[]>();
  for (const row of results) {
    const list = resultsByLog.get(row.session_log_id);
    if (list) list.push(row);
    else resultsByLog.set(row.session_log_id, [row]);
  }

  const sessionDates = [
    ...new Set(logs.map((l) => l.session_date)),
  ].sort((a, b) => a.localeCompare(b));

  const attendanceByDate = sessionDates.map((session_date) => {
    const athleteIds = new Set(
      logs.filter((l) => l.session_date === session_date).map((l) => l.athlete_id)
    );
    return { session_date, count: athleteIds.size };
  });

  const logsByAthlete = new Map<string, ReportLog[]>();
  for (const log of logs) {
    const list = logsByAthlete.get(log.athlete_id);
    if (list) list.push(log);
    else logsByAthlete.set(log.athlete_id, [log]);
  }

  const priorLogs = input.priorLogs ?? [];
  const priorResults = input.priorResults ?? [];
  const priorLogIdsByAthlete = new Map<string, Set<string>>();
  for (const log of priorLogs) {
    const set = priorLogIdsByAthlete.get(log.athlete_id) ?? new Set<string>();
    set.add(log.id);
    priorLogIdsByAthlete.set(log.athlete_id, set);
  }

  const athleteIds = [...logsByAthlete.keys()];
  athleteIds.sort((a, b) => {
    const left = athleteById.get(a);
    const right = athleteById.get(b);
    const last = (left?.last_name ?? "").localeCompare(right?.last_name ?? "");
    if (last !== 0) return last;
    return (left?.first_name ?? "").localeCompare(right?.first_name ?? "");
  });

  const athleteRows: AthleteReportRow[] = athleteIds.map((athlete_id) => {
    const athleteLogs = logsByAthlete.get(athlete_id) ?? [];
    const athleteResults = athleteLogs.flatMap(
      (l) => resultsByLog.get(l.id) ?? []
    );
    const logDateById = new Map(athleteLogs.map((l) => [l.id, l.session_date]));
    const days = [...new Set(athleteLogs.map((l) => l.session_date))].sort((a, b) =>
      a.localeCompare(b)
    );

    const movementsTrained: string[] = [];
    const seenNames = new Set<string>();
    for (const row of athleteResults) {
      if (!hasLoggedText(row.raw_text)) continue;
      const name = movementById.get(row.movement_id)?.name;
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      movementsTrained.push(name);
    }

    const outputs: ReportOutputRow[] = [];
    for (const row of athleteResults) {
      if (!hasLoggedText(row.raw_text)) continue;
      const movement = movementById.get(row.movement_id);
      if (!isOutputResult(row, movement)) continue;
      outputs.push({
        movement_name: movement?.name ?? "Unknown movement",
        kind: row.kind,
        load: asNumber(row.load),
        reps: asNumber(row.reps),
        units: row.units,
        raw_text: row.raw_text,
        session_date: logDateById.get(row.session_log_id) ?? "",
      });
    }

    const byDate: AthleteDateRow[] = days.map((session_date) => {
      const dayLogIds = new Set(
        athleteLogs.filter((l) => l.session_date === session_date).map((l) => l.id)
      );
      const dayResults = athleteResults.filter((r) => dayLogIds.has(r.session_log_id));
      return {
        session_date,
        setsLogged: setsLoggedOf(dayResults),
        parsedVolume: parsedVolumeOf(dayResults),
        bestLoad: maxLoad(dayResults),
      };
    });

    let priorWeekBestLoad: number | null = null;
    if (priorResults.length > 0) {
      const priorIds = priorLogIdsByAthlete.get(athlete_id);
      const matching = priorIds
        ? priorResults.filter((r) => priorIds.has(r.session_log_id))
        : [];
      priorWeekBestLoad = matching.length > 0 ? maxLoad(matching) : null;
    }

    const meta = athleteById.get(athlete_id);

    return {
      athlete_id,
      first_name: meta?.first_name ?? "",
      last_name: meta?.last_name ?? "",
      daysPresent: days.length,
      movementsTrained,
      setsLogged: setsLoggedOf(athleteResults),
      parsedVolume: parsedVolumeOf(athleteResults),
      bestLoad: maxLoad(athleteResults),
      priorWeekBestLoad,
      outputs,
      byDate,
    };
  });

  return {
    hugo_group: input.hugo_group,
    from: input.from,
    to: input.to,
    sessionDates,
    attendanceByDate,
    athletes: athleteRows,
  };
}
