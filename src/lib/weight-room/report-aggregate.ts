import type { HugoGroup } from "./constants";
import {
  isFortyYardMphPrimary,
  mphFromYardSplit,
  showFortyYardMphSecondary,
  yardsInFortyComponent,
} from "@/lib/norms/forty-yd";
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "@/lib/norms/editor-metrics";

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
  speed_journal_metric_key?: string | null;
  speed_journal_component?: string | null;
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

export type JournalAttendanceRow = {
  athlete_id: string;
  session_date: string;
  first_name: string;
  last_name: string;
};

/** Speed Journal timed/mph marks for report Outputs (best mph per drill). */
export type JournalSpeedMark = {
  athlete_id: string;
  session_date: string;
  first_name: string;
  last_name: string;
  metric_key: string;
  component: string | null;
  value: number;
  units: string;
  raw_input: string | null;
};

/** Speed Journal testing-day attendance. Same athlete+date as a scan is not duplicated. */
export function mergeJournalAttendance(
  source: Pick<ReportAggregateInput, "logs" | "results" | "movements" | "athletes">,
  rows: JournalAttendanceRow[],
  hugo_group: HugoGroup
): Pick<ReportAggregateInput, "logs" | "results" | "movements" | "athletes"> {
  const logs = [...source.logs];
  const athletes = [...source.athletes];
  const seenDates = new Set(
    logs.map((log) => `${log.athlete_id}\0${log.session_date}`)
  );
  const seenAthletes = new Set(athletes.map((athlete) => athlete.id));

  for (const row of rows) {
    if (!seenAthletes.has(row.athlete_id)) {
      seenAthletes.add(row.athlete_id);
      athletes.push({
        id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
      });
    }
    const key = `${row.athlete_id}\0${row.session_date}`;
    if (seenDates.has(key)) continue;
    seenDates.add(key);
    logs.push({
      id: `journal:${row.athlete_id}:${row.session_date}`,
      athlete_id: row.athlete_id,
      template_id: "journal",
      session_date: row.session_date,
      hugo_group,
    });
  }

  return {
    logs,
    results: source.results,
    movements: source.movements,
    athletes,
  };
}

export type ReportOutputRow = {
  movement_name: string;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
  raw_text: string | null;
  session_date: string;
  /** When set, this row is a speed drill summarized as mph. */
  drill_label?: string | null;
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
/** Fly / split labels in movement names: 5-15yd, 10-20yd, etc. */
const NAME_SPLIT_YARDS = /(\d+)\s*-\s*(\d+)\s*yd/i;

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

/** Yards covered by a mapped component or a `N-Myd` movement name. */
export function resolveSpeedDrillYards(
  movement: ReportMovement | undefined
): number | null {
  if (!movement) return null;
  const fromComponent = yardsInFortyComponent(
    movement.speed_journal_component ?? null
  );
  if (fromComponent != null) return fromComponent;
  const match = (movement.name ?? "").match(NAME_SPLIT_YARDS);
  if (!match) return null;
  const yards = Number(match[2]) - Number(match[1]);
  return yards > 0 ? yards : null;
}

export function speedDrillLabel(movement: ReportMovement | undefined): string {
  if (!movement) return "Speed drill";
  const component = movement.speed_journal_component?.trim();
  // Prefer the split label so WR + journal marks for the same fly collapse together.
  if (component) return component;
  const name = movement.name?.trim() || "Speed drill";
  return name;
}

/** True when a journal entry can become a weekly mph output. */
export function journalSpeedMarkMph(mark: JournalSpeedMark): number | null {
  const value = asNumber(mark.value);
  if (value == null || value <= 0) return null;
  const units = (mark.units ?? "").trim().toLowerCase();
  if (units === "mph") return Math.round(value * 100) / 100;
  if (units !== "s" && units !== "") return null;
  const component = mark.component;
  if (
    !isFortyYardMphPrimary(mark.metric_key, component) &&
    !showFortyYardMphSecondary(mark.metric_key, component)
  ) {
    return null;
  }
  const yards = yardsInFortyComponent(component);
  if (yards == null) return null;
  const mph = mphFromYardSplit(value, yards);
  return mph == null ? null : Math.round(mph * 100) / 100;
}

/**
 * Inject Speed Journal fly/mph marks as synthetic set_results so Outputs can
 * show best mph + drill label (alongside weight-room duration marks).
 */
export function mergeJournalSpeedMarks(
  source: Pick<ReportAggregateInput, "logs" | "results" | "movements" | "athletes">,
  marks: JournalSpeedMark[],
  hugo_group: HugoGroup
): Pick<ReportAggregateInput, "logs" | "results" | "movements" | "athletes"> {
  const logs = [...source.logs];
  const results = [...source.results];
  const movements = [...source.movements];
  const athletes = [...source.athletes];

  const seenAthletes = new Set(athletes.map((a) => a.id));
  const logByAthleteDate = new Map(
    logs.map((log) => [`${log.athlete_id}\0${log.session_date}`, log.id])
  );
  const movementSeen = new Set(movements.map((m) => m.id));

  for (const mark of marks) {
    if (journalSpeedMarkMph(mark) == null) continue;

    if (!seenAthletes.has(mark.athlete_id)) {
      seenAthletes.add(mark.athlete_id);
      athletes.push({
        id: mark.athlete_id,
        first_name: mark.first_name,
        last_name: mark.last_name,
      });
    }

    const dateKey = `${mark.athlete_id}\0${mark.session_date}`;
    let logId = logByAthleteDate.get(dateKey);
    if (!logId) {
      logId = `journal:${mark.athlete_id}:${mark.session_date}`;
      logByAthleteDate.set(dateKey, logId);
      logs.push({
        id: logId,
        athlete_id: mark.athlete_id,
        template_id: "journal",
        session_date: mark.session_date,
        hugo_group,
      });
    }

    const component = mark.component?.trim() || null;
    const movementId = `journal-speed:${mark.metric_key}:${component ?? ""}`;
    if (!movementSeen.has(movementId)) {
      movementSeen.add(movementId);
      movements.push({
        id: movementId,
        name: component ?? mark.metric_key,
        targets: null,
        speed_journal_metric_key: mark.metric_key,
        speed_journal_component: component,
      });
    }

    const units = (mark.units ?? "").trim().toLowerCase();
    const isMph = units === "mph";
    results.push({
      session_log_id: logId,
      movement_id: movementId,
      raw_text: mark.raw_input?.trim() || String(mark.value),
      kind: isMph ? "output" : "duration",
      load: mark.value,
      reps: null,
      units: isMph ? "mph" : "s",
    });
  }

  return { logs, results, movements, athletes };
}

function isTimedSpeedMark(
  row: ReportResult,
  movement: ReportMovement | undefined
): boolean {
  const load = asNumber(row.load);
  if (load == null || load <= 0) return false;
  const timed =
    row.kind === "duration" ||
    (row.kind === "output" && (row.units === "s" || row.units == null));
  if (!timed) return false;
  if (resolveSpeedDrillYards(movement) != null) return true;
  const key = movement?.speed_journal_metric_key ?? "";
  return key === FORTY_YD_DASH || key === TWENTY_YD_DASH;
}

function isDirectMphMark(row: ReportResult): boolean {
  return (
    row.kind === "output" &&
    row.units === "mph" &&
    asNumber(row.load) != null
  );
}

function isClassicOutputResult(
  row: ReportResult,
  movement: ReportMovement | undefined
): boolean {
  if (row.kind === "output" && row.units !== "s" && row.units !== "mph") {
    return true;
  }
  if (row.kind === "output" && row.units == null && !isTimedSpeedMark(row, movement)) {
    // inches / generic output without units
    return true;
  }
  const name = movement?.name ?? "";
  const targets = (movement?.targets ?? []).join(" ");
  return OUTPUT_HINT.test(name) || OUTPUT_HINT.test(targets);
}

function isOutputResult(row: ReportResult, movement: ReportMovement | undefined): boolean {
  if (isDirectMphMark(row)) return true;
  if (isTimedSpeedMark(row, movement)) return true;
  return isClassicOutputResult(row, movement);
}

/** Bare jump-mat cells often land as kind=unknown with the inches only in raw_text. */
function parseNumericRawText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function looksLikeJumpHeight(
  movement: ReportMovement | undefined,
  row: ReportResult
): boolean {
  const blob = `${movement?.name ?? ""} ${(movement?.targets ?? []).join(" ")} ${row.raw_text ?? ""}`;
  if (/\bCMJ\b|\bjump\b|\bvert/i.test(blob)) return true;
  if (/(?:in|["”″])\s*$/i.test((row.raw_text ?? "").trim())) return true;
  const units = (row.units ?? "").toLowerCase();
  return units === "in" || units === "cm" || units === "inches" || units === '"';
}

function classicOutputLoad(
  row: ReportResult,
  movement: ReportMovement | undefined
): number | null {
  const fromLoad = asNumber(row.load);
  if (fromLoad != null) return fromLoad;
  if (looksLikeJumpHeight(movement, row) || row.kind === "output" || row.kind === "unknown") {
    return parseNumericRawText(row.raw_text);
  }
  return null;
}

function classicOutputUnits(
  row: ReportResult,
  movement: ReportMovement | undefined
): string | null {
  if (row.units) return row.units;
  if (looksLikeJumpHeight(movement, row)) return "in";
  return null;
}

/** Convert a timed set_result into mph when possible. */
export function speedResultToMph(
  row: ReportResult,
  movement: ReportMovement | undefined
): number | null {
  if (isDirectMphMark(row)) return asNumber(row.load);
  if (!isTimedSpeedMark(row, movement)) return null;
  const timeS = asNumber(row.load);
  if (timeS == null) return null;
  const yards = resolveSpeedDrillYards(movement);
  if (yards == null) return null;
  const mph = mphFromYardSplit(timeS, yards);
  return mph == null ? null : Math.round(mph * 100) / 100;
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
  let n = 0;
  for (const row of results) {
    if (hasLoggedText(row.raw_text)) n += 1;
  }
  return n;
}

/**
 * Build output rows: classic tests stay as-logged; timed speed drills collapse
 * to best mph per drill label within the athlete's results.
 */
export function buildAthleteOutputRows(
  athleteResults: ReportResult[],
  movementById: Map<string, ReportMovement>,
  logDateById: Map<string, string>
): ReportOutputRow[] {
  const classic: ReportOutputRow[] = [];
  /** drillLabel → best mph row */
  const bestSpeed = new Map<string, ReportOutputRow>();

  for (const row of athleteResults) {
    if (!hasLoggedText(row.raw_text)) continue;
    const movement = movementById.get(row.movement_id);
    if (!isOutputResult(row, movement)) continue;

    const mph = speedResultToMph(row, movement);
    if (mph != null && (isTimedSpeedMark(row, movement) || isDirectMphMark(row))) {
      const label = speedDrillLabel(movement);
      const candidate: ReportOutputRow = {
        movement_name: label,
        drill_label: label,
        kind: "output",
        load: mph,
        reps: null,
        units: "mph",
        raw_text: row.raw_text,
        session_date: logDateById.get(row.session_log_id) ?? "",
      };
      const prev = bestSpeed.get(label);
      if (!prev || (prev.load ?? 0) < mph) {
        bestSpeed.set(label, candidate);
      }
      continue;
    }

    // MaxVelocity-style metric logged as mph already handled above.
    // Skip timed rows that couldn't convert (no yards) from classic list.
    if (isTimedSpeedMark(row, movement)) continue;

    classic.push({
      movement_name: movement?.name ?? "Unknown movement",
      kind: row.kind === "unknown" ? "output" : row.kind,
      load: classicOutputLoad(row, movement),
      reps: asNumber(row.reps),
      units: classicOutputUnits(row, movement),
      raw_text: row.raw_text,
      session_date: logDateById.get(row.session_log_id) ?? "",
    });
  }

  return [...classic, ...bestSpeed.values()];
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

    const outputs = buildAthleteOutputRows(
      athleteResults,
      movementById,
      logDateById
    );

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
