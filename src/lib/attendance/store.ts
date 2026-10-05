import { sql } from "@/lib/db";
import { serializeDate } from "@/lib/weight-room/insert-template";
import { loadTeamJournalAttendance } from "@/lib/weight-room/report-load";
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";
import {
  BoundScheduleError,
  boundScheduleUrl,
  fetchBoundScheduleHtml,
  parseBoundSchedule,
  parseVarsityScheduleTable,
  VARSITY_SCHEDULE_URLS,
  type BoundContest,
  type UnmatchedBoundContest,
} from "./bound";
import { assertAttendanceRange, type ScheduleEdit } from "./dates";
import type {
  AttendanceGame,
  AttendanceMember,
  AttendancePresent,
  AttendanceReportInput,
  Enrollment,
} from "./report";

export { BoundScheduleError };

export class AttendanceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceStoreError";
  }
}

function assertHugoGroup(hugoGroup: string): asserts hugoGroup is HugoGroup {
  if (!isHugoGroup(hugoGroup)) {
    throw new AttendanceStoreError("Invalid hugo_group");
  }
}

/** Real YYYY-MM-DD only. `2026-02-31` fails the UTC-noon round-trip. */
function requireSessionDate(value: unknown): string {
  if (typeof value !== "string") {
    throw new AttendanceStoreError("Invalid date");
  }
  const trimmed = value.trim();
  const result = assertAttendanceRange(trimmed, trimmed);
  if (!result.ok) {
    throw new AttendanceStoreError("Invalid date");
  }
  return trimmed;
}

function requireRange(from: string, to: string): { from: string; to: string } {
  const start = from.trim();
  const end = to.trim();
  const result = assertAttendanceRange(start, end);
  if (!result.ok) {
    throw new AttendanceStoreError(result.error);
  }
  return { from: start, to: end };
}

/** Unique ISO weekdays, Monday = 1 through Sunday = 7. Null when any value is invalid. */
function normalizeWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<number>();
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 7) {
      return null;
    }
    seen.add(item);
  }
  return [...seen].sort((a, b) => a - b);
}

function weekdayArrayLiteral(weekdays: number[]): string {
  return `{${weekdays.join(",")}}`;
}

function readWeekdays(value: unknown): number[] {
  const parts: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .replace(/^\{|\}$/g, "")
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part !== "")
      : [];
  const seen = new Set<number>();
  for (const part of parts) {
    const n = typeof part === "number" ? part : Number(part);
    if (Number.isInteger(n) && n >= 1 && n <= 7) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function isEditAction(value: unknown): value is ScheduleEdit["action"] {
  return value === "add" || value === "cancel";
}

function readEnrollment(value: unknown): Enrollment | null {
  if (value === "liberty" || value === "homeschool" || value === "coop") {
    return value;
  }
  return null;
}

export async function getRhythm(hugoGroup: string): Promise<number[]> {
  assertHugoGroup(hugoGroup);
  const { rows } = await sql`
    SELECT weekdays
    FROM sport_practice_rhythms
    WHERE hugo_group = ${hugoGroup}
    LIMIT 1
  `;
  if (rows.length === 0) return [];
  const row = rows[0] as { weekdays: unknown };
  return readWeekdays(row.weekdays);
}

export async function saveRhythm(
  hugoGroup: string,
  weekdays: unknown,
): Promise<number[]> {
  assertHugoGroup(hugoGroup);
  const normalized = normalizeWeekdays(weekdays);
  if (!normalized) {
    throw new AttendanceStoreError("Invalid weekdays");
  }
  const literal = weekdayArrayLiteral(normalized);
  await sql`
    INSERT INTO sport_practice_rhythms (hugo_group, weekdays)
    VALUES (${hugoGroup}, ${literal}::smallint[])
    ON CONFLICT (hugo_group)
    DO UPDATE SET weekdays = EXCLUDED.weekdays
  `;
  return normalized;
}

export async function listEdits(
  hugoGroup: string,
  from: string,
  to: string,
): Promise<ScheduleEdit[]> {
  assertHugoGroup(hugoGroup);
  const range = requireRange(from, to);
  const { rows } = await sql`
    SELECT to_char(session_date, 'YYYY-MM-DD') AS session_date, action
    FROM attendance_session_edits
    WHERE hugo_group = ${hugoGroup}
      AND session_date BETWEEN ${range.from}::date AND ${range.to}::date
    ORDER BY session_date
  `;
  const edits: ScheduleEdit[] = [];
  for (const row of rows as Array<{ session_date: unknown; action: unknown }>) {
    if (!isEditAction(row.action)) continue;
    const sessionDate = serializeDate(row.session_date);
    if (!assertAttendanceRange(sessionDate, sessionDate).ok) continue;
    edits.push({ session_date: sessionDate, action: row.action });
  }
  return edits;
}

export async function saveEdit(
  hugoGroup: string,
  sessionDate: unknown,
  action: unknown,
): Promise<void> {
  assertHugoGroup(hugoGroup);
  if (!isEditAction(action)) {
    throw new AttendanceStoreError("Invalid action");
  }
  const date = requireSessionDate(sessionDate);
  await sql`
    INSERT INTO attendance_session_edits (hugo_group, session_date, action)
    VALUES (${hugoGroup}, ${date}::date, ${action})
    ON CONFLICT (hugo_group, session_date)
    DO UPDATE SET action = EXCLUDED.action
  `;
}

export async function clearEdit(
  hugoGroup: string,
  sessionDate: unknown,
): Promise<void> {
  assertHugoGroup(hugoGroup);
  const date = requireSessionDate(sessionDate);
  await sql`
    DELETE FROM attendance_session_edits
    WHERE hugo_group = ${hugoGroup}
      AND session_date = ${date}::date
  `;
}

export type RefreshVarsityResult = {
  saved: number;
  unmatched: UnmatchedBoundContest[];
};

/** Coach-added game. Clears a prior dismiss and marks the row manual. */
export async function saveManualContest(
  hugoGroup: string,
  contestDate: unknown,
  label: unknown,
): Promise<void> {
  assertHugoGroup(hugoGroup);
  const date = requireSessionDate(contestDate);
  const labelText = typeof label === "string" && label.trim() ? label.trim() : null;
  await sql`
    INSERT INTO varsity_contests (hugo_group, contest_date, source, bound_key, label, dismissed)
    VALUES (${hugoGroup}, ${date}::date, 'manual', NULL, ${labelText}, false)
    ON CONFLICT (hugo_group, contest_date)
    DO UPDATE SET
      source = 'manual',
      dismissed = false,
      label = COALESCE(${labelText}, varsity_contests.label)
  `;
}

/** Hide a game without deleting it, so a later Bound refresh cannot bring it back. */
export async function dismissContest(
  hugoGroup: string,
  contestDate: unknown,
): Promise<void> {
  assertHugoGroup(hugoGroup);
  const date = requireSessionDate(contestDate);
  await sql`
    UPDATE varsity_contests
    SET dismissed = true
    WHERE hugo_group = ${hugoGroup}
      AND contest_date = ${date}::date
  `;
}

/**
 * Pull varsity dates for one sport from Bound.
 * Volleyball, boys soccer, XC, and football use that sport's schedule table.
 * Football is the St. Agnes co-op page. Other sports use the school overview.
 * A page with no parsed varsity contests fails before any write.
 * Manual rows and dismissed rows are left as they are.
 * `unmatched` is every varsity card from the school page that mapped to no sport.
 */
export async function refreshVarsityContests(
  hugoGroup: string,
): Promise<RefreshVarsityResult> {
  assertHugoGroup(hugoGroup);
  let html: string;
  try {
    html = await fetchBoundScheduleHtml(boundScheduleUrl(hugoGroup));
  } catch (err) {
    console.error(
      "Bound schedule request failed:",
      err instanceof Error ? err.message : "unknown",
    );
    throw new BoundScheduleError("Bound did not return a schedule");
  }

  const parsed = VARSITY_SCHEDULE_URLS[hugoGroup]
    ? { contests: parseVarsityScheduleTable(html, hugoGroup), unmatched: [] }
    : parseBoundSchedule(html);
  if (parsed.contests.length === 0) {
    throw new BoundScheduleError("Bound did not return a schedule");
  }

  const mine = parsed.contests.filter((row) => row.hugo_group === hugoGroup);
  const wrote = await Promise.all(mine.map((row) => upsertBoundContest(row)));
  return {
    saved: wrote.filter(Boolean).length,
    unmatched: parsed.unmatched,
  };
}

/**
 * Inputs for `buildAttendanceReport`. Card logs and testing entries stay
 * separate rows; the pure function dedupes the same athlete on the same day.
 */
export async function loadAttendanceInput(
  hugoGroup: string,
  from: string,
  to: string,
): Promise<AttendanceReportInput> {
  assertHugoGroup(hugoGroup);
  const range = requireRange(from, to);

  const [members, cards, testing, weekdays, edits, games] = await Promise.all([
    loadAttendanceMembers(hugoGroup),
    loadCardPresent(hugoGroup, range.from, range.to),
    loadTestingPresent(hugoGroup, range.from, range.to),
    getRhythm(hugoGroup),
    listEdits(hugoGroup, range.from, range.to),
    loadGames(hugoGroup, range.from, range.to),
  ]);

  return {
    hugo_group: hugoGroup,
    from: range.from,
    to: range.to,
    weekdays,
    edits,
    members,
    present: [...cards, ...testing],
    games,
  };
}

async function loadAttendanceMembers(hugoGroup: string): Promise<AttendanceMember[]> {
  const { rows } = await sql`
    SELECT
      a.id AS athlete_id,
      a.first_name,
      a.last_name,
      a.enrollment,
      to_char(m.created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS joined_on
    FROM athlete_hugo_memberships m
    JOIN athletes a ON a.id = m.athlete_id
    WHERE m.hugo_group = ${hugoGroup}
      AND a.active = true
    ORDER BY a.last_name, a.first_name, a.id
  `;
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    athlete_id: String(row.athlete_id),
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    enrollment: readEnrollment(row.enrollment),
    joined_on:
      typeof row.joined_on === "string"
        ? row.joined_on
        : serializeDate(row.joined_on),
  }));
}

async function loadCardPresent(
  hugoGroup: string,
  from: string,
  to: string,
): Promise<AttendancePresent[]> {
  const { rows } = await sql`
    SELECT DISTINCT
      athlete_id,
      to_char(session_date, 'YYYY-MM-DD') AS session_date
    FROM session_logs
    WHERE hugo_group = ${hugoGroup}
      AND session_date BETWEEN ${from}::date AND ${to}::date
  `;
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    athlete_id: String(row.athlete_id),
    session_date: serializeDate(row.session_date),
  }));
}

async function loadTestingPresent(
  hugoGroup: string,
  from: string,
  to: string,
): Promise<AttendancePresent[]> {
  const rows = await loadTeamJournalAttendance({
    hugo_group: hugoGroup,
    from,
    to,
  });
  return rows.map((row) => ({
    athlete_id: row.athlete_id,
    session_date: row.session_date,
  }));
}

async function loadGames(
  hugoGroup: string,
  from: string,
  to: string,
): Promise<AttendanceGame[]> {
  const { rows } = await sql`
    SELECT
      to_char(contest_date, 'YYYY-MM-DD') AS contest_date,
      dismissed
    FROM varsity_contests
    WHERE hugo_group = ${hugoGroup}
      AND contest_date BETWEEN ${from}::date AND ${to}::date
    ORDER BY contest_date
  `;
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    contest_date: serializeDate(row.contest_date),
    dismissed: row.dismissed === true,
  }));
}

async function upsertBoundContest(row: BoundContest): Promise<boolean> {
  const { rows } = await sql`
    INSERT INTO varsity_contests (hugo_group, contest_date, source, bound_key, label, dismissed)
    VALUES (
      ${row.hugo_group},
      ${row.contest_date}::date,
      'bound',
      ${row.bound_key},
      ${row.label},
      false
    )
    ON CONFLICT (hugo_group, contest_date)
    DO UPDATE SET
      source = 'bound',
      bound_key = EXCLUDED.bound_key,
      label = EXCLUDED.label
    WHERE varsity_contests.dismissed = false
      AND varsity_contests.source = 'bound'
    RETURNING contest_date
  `;
  return rows.length > 0;
}
