import { sql } from "@/lib/db";
import {
  FORTY_YD_DASH,
  FORTY_YD_PRIMARY_COMPONENT,
} from "@/lib/norms/editor-metrics";
import {
  pickBestMaxVelocityHits,
  pickBestTwentyYdHits,
  type DerivedSplitRow,
} from "@/lib/norms/testing-day-derived";
import { sameSpeedMark } from "@/lib/speed/windows";
import { compareMark, SHARED_SOCCER_KEYS } from "./compare";
import { bestDriPerAthleteBox, pickTeamDriBox } from "./dri";
import { latestRepeatSeriesTimes, scoreRepeatSprint } from "./repeat-sprint";
import { scoreBatteryRows, type BatteryMark, type ScoredCell } from "./score-row";
import { BOYS_BASKETBALL_BASELINE } from "./template";

export type BoardDirection = "higher" | "lower";

export type BoardDelta = {
  previous: number;
  current: number;
  change: number;
  improved: boolean;
};

export type BoardCell = {
  value: number;
  rank: number;
  tied: boolean;
  points: number;
  band?: string;
  delta?: BoardDelta;
};

export type BoardColumn = {
  key: string;
  label: string;
  direction: BoardDirection;
  units: string;
};

export type BoardAthlete = {
  athlete_id: string;
  bib: string | null;
  first_name: string;
  last_name: string;
  group_key: string | null;
  total_points: number;
  slots_completed: number;
  qualifier: string | null;
  higher_box: boolean;
  cells: Record<string, BoardCell>;
};

export type BoardGroup = {
  group_key: string;
  label: string;
};

export type BoardPayload = {
  battery: {
    id: string;
    title: string;
    grouping_mode: string;
    cutoff_n: number | null;
    team_dri_box: string | null;
    team_dri_locked: boolean;
  };
  view: "today" | "meet";
  day_label: string;
  groups: BoardGroup[];
  columns: BoardColumn[];
  athletes: BoardAthlete[];
  untested_ids: string[];
};

const HIGHER_METRIC_KEYS = [
  "10-5_RSI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
] as const;

const SPRINT_COLUMN_KEYS = ["20yd_Dash", "40yd_Dash", "MaxVelocity"] as const;
const REPEAT_COLUMN_KEYS = ["10x10m_best", "10x10m_mean", "10x10m_decrement"] as const;

const COLUMN_ORDER = [
  "10-5_RSI",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "DRI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
  "10x10m",
] as const;

const COLUMN_META: Record<string, { label: string; direction: BoardDirection; units: string }> = {
  "10-5_RSI": { label: "RSI", direction: "higher", units: "RSI" },
  "20yd_Dash": { label: "20yd", direction: "lower", units: "s" },
  "40yd_Dash": { label: "40yd", direction: "lower", units: "s" },
  MaxVelocity: { label: "Max Velocity", direction: "higher", units: "mph" },
  DRI: { label: "DRI", direction: "higher", units: "DRI" },
  "Standing-Broad": { label: "Broad", direction: "higher", units: "ft" },
  "Vertical Jump": { label: "Vertical", direction: "higher", units: "in" },
  "OH-MB_Throw": { label: "Med Ball", direction: "higher", units: "ft" },
  "10x10m_best": { label: "10x10 Best", direction: "lower", units: "s" },
  "10x10m_mean": { label: "10x10 Mean", direction: "lower", units: "s" },
  "10x10m_decrement": { label: "Decrement", direction: "lower", units: "%" },
  "10x10m": { label: "10x10", direction: "lower", units: "s" },
};

type BatteryRow = {
  id: string;
  title: string;
  hugo_group: string;
  grouping_mode: string;
  cutoff_n: number | string | null;
  comparison_session_id: string | null;
};

type DayRow = {
  day_key: string;
  label: string;
  session_id: string | null;
  sort_order: number | string;
  closed_at: string | Date | null;
  locked_dri_box: string | null;
};

type RawEntry = {
  session_id: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  metric_key: string;
  component: string | null;
  interval_index: number | string | null;
  display_value: number | string | null;
  units: string | null;
  legacy_metric_key?: string | null;
  legacy_component?: string | null;
  qualifier?: string | null;
  raw_input?: string | null;
  created_at?: string | Date | number | null;
};

type NormEntry = {
  session_id: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  metric_key: string;
  component: string | null;
  interval_index: number | null;
  display_value: number;
  units: string | null;
  legacy_metric_key: string | null;
  legacy_component: string | null;
  qualifier: string | null;
  raw_input: string;
  created_at: number;
};

type RosterAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  bib: string | null;
};

export function readPgError(err: unknown): { codes: string[]; message: string } {
  const codes: string[] = [];
  const messages: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const rec = current as { code?: string; message?: string; cause?: unknown };
    if (typeof rec.code === "string") codes.push(rec.code);
    if (typeof rec.message === "string") messages.push(rec.message);
    current = rec.cause;
  }
  return { codes, message: messages.join(" ") };
}

export function isBatterySchemaMissing(err: unknown): boolean {
  const { codes } = readPgError(err);
  return codes.includes("42P01") || codes.includes("42703");
}

function finiteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function timestampMs(raw: unknown): number {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function expandedDayKeys(dayTests: string[]): string[] {
  const keys: string[] = [];
  for (const test of dayTests) {
    if (test === "40yd_Dash") {
      keys.push(...SPRINT_COLUMN_KEYS);
      continue;
    }
    if (test === "10x10m") {
      keys.push(...REPEAT_COLUMN_KEYS);
      continue;
    }
    keys.push(test);
  }
  return keys;
}

function asText(raw: unknown): string {
  return raw == null ? "" : String(raw);
}

function testsForDay(dayKey: string): string[] {
  const match = BOYS_BASKETBALL_BASELINE.days.find((day) => day.day_key === dayKey);
  return match ? [...match.metric_keys] : [];
}

function columnFor(key: string, teamBox: string | null): BoardColumn {
  const meta = COLUMN_META[key] ?? { label: key, direction: "higher" as const, units: "" };
  const label = key === "DRI" && teamBox ? `DRI @ ${teamBox}in` : meta.label;
  return { key, label, direction: meta.direction, units: meta.units };
}

function keysWithCells(rows: { cells: Record<string, ScoredCell> }[]): Set<string> {
  const present = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.cells)) present.add(key);
  }
  return present;
}

function meetColumnKeys(present: Set<string>, expandSprint: boolean): string[] {
  const sprint = new Set<string>(SPRINT_COLUMN_KEYS);
  return COLUMN_ORDER.filter((key) => {
    if (key === "10x10m") return false;
    if (expandSprint && sprint.has(key)) return true;
    return present.has(key);
  });
}

function hasFortyEntry(rows: NormEntry[]): boolean {
  return rows.some((row) => sameSpeedMark(row, FORTY_YD_DASH, null));
}

function toDerived(row: NormEntry): DerivedSplitRow {
  return {
    athlete_id: row.athlete_id,
    first_name: row.first_name,
    last_name: row.last_name,
    gender: row.gender,
    metric_key: row.metric_key,
    component: row.component,
    display_value: row.display_value,
    units: row.units,
    legacy_metric_key: row.legacy_metric_key,
    legacy_component: row.legacy_component,
  };
}

function normalizeEntry(row: RawEntry): NormEntry | null {
  const displayValue = finiteNumber(row.display_value);
  if (displayValue == null) return null;
  const interval = finiteNumber(row.interval_index);
  return {
    session_id: String(row.session_id),
    athlete_id: String(row.athlete_id),
    first_name: asText(row.first_name),
    last_name: asText(row.last_name),
    gender: row.gender == null ? null : String(row.gender),
    metric_key: String(row.metric_key),
    component: row.component == null ? null : String(row.component),
    interval_index: interval,
    display_value: displayValue,
    units: row.units == null ? null : String(row.units),
    legacy_metric_key: row.legacy_metric_key == null ? null : String(row.legacy_metric_key),
    legacy_component: row.legacy_component == null ? null : String(row.legacy_component),
    qualifier: row.qualifier == null || row.qualifier === "" ? null : String(row.qualifier),
    raw_input: row.raw_input == null ? "" : String(row.raw_input),
    created_at: timestampMs(row.created_at),
  };
}

function isUndefinedColumn(err: unknown): boolean {
  return readPgError(err).codes.includes("42703");
}

async function loadEntries(sessionIds: string[]): Promise<NormEntry[]> {
  if (sessionIds.length === 0) return [];
  const ids = sessionIds as unknown as string;
  const mapRows = (rows: RawEntry[]) =>
    rows.flatMap((row) => {
      const normalized = normalizeEntry(row);
      return normalized ? [normalized] : [];
    });

  try {
    const { rows } = await sql`
      SELECT
        e.session_id,
        e.athlete_id,
        a.first_name,
        a.last_name,
        a.gender,
        a.graduating_class,
        e.metric_key,
        e.component,
        e.interval_index,
        e.display_value,
        e.units,
        e.legacy_metric_key,
        e.legacy_component,
        e.qualifier,
        e.raw_input,
        e.created_at
      FROM entries e
      INNER JOIN athletes a ON a.id = e.athlete_id
      WHERE e.session_id = ANY(${ids}::uuid[])
    `;
    return mapRows(rows as RawEntry[]);
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
  }

  try {
    const { rows } = await sql`
      SELECT
        e.session_id,
        e.athlete_id,
        a.first_name,
        a.last_name,
        a.gender,
        a.graduating_class,
        e.metric_key,
        e.component,
        e.interval_index,
        e.display_value,
        e.units,
        e.legacy_metric_key,
        e.legacy_component,
        e.raw_input,
        e.created_at
      FROM entries e
      INNER JOIN athletes a ON a.id = e.athlete_id
      WHERE e.session_id = ANY(${ids}::uuid[])
    `;
    return mapRows(
      (rows as RawEntry[]).map((row) => ({
        ...row,
        qualifier: null,
      }))
    );
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
  }

  const { rows } = await sql`
    SELECT
      e.session_id,
      e.athlete_id,
      a.first_name,
      a.last_name,
      a.gender,
      a.graduating_class,
      e.metric_key,
      e.component,
      e.interval_index,
      e.display_value,
      e.units,
      e.raw_input,
      e.created_at
    FROM entries e
    INNER JOIN athletes a ON a.id = e.athlete_id
    WHERE e.session_id = ANY(${ids}::uuid[])
  `;
  return mapRows(
    (rows as RawEntry[]).map((row) => ({
      ...row,
      qualifier: null,
      legacy_metric_key: null,
      legacy_component: null,
    }))
  );
}

async function loadHugoAthletes(hugoGroup: string) {
  try {
    const { rows } = await sql`
      SELECT a.id, a.first_name, a.last_name
      FROM athletes a
      INNER JOIN athlete_hugo_memberships m ON m.athlete_id = a.id
      WHERE m.hugo_group = ${hugoGroup}
        AND a.active = true
    `;
    return rows as { id: string; first_name: string; last_name: string }[];
  } catch (err) {
    const { codes, message } = readPgError(err);
    if (!codes.includes("42703") || !message.toLowerCase().includes("active")) throw err;
    const { rows } = await sql`
      SELECT a.id, a.first_name, a.last_name
      FROM athletes a
      INNER JOIN athlete_hugo_memberships m ON m.athlete_id = a.id
      WHERE m.hugo_group = ${hugoGroup}
    `;
    return rows as { id: string; first_name: string; last_name: string }[];
  }
}

function sprintMarks(rows: NormEntry[]): BatteryMark[] {
  const derived = rows.map(toDerived);
  const marks: BatteryMark[] = [];
  for (const hit of pickBestTwentyYdHits(derived)) {
    marks.push({ athlete_id: hit.athlete_id, key: "20yd_Dash", value: hit.display_value });
  }
  for (const hit of pickBestMaxVelocityHits(derived)) {
    marks.push({ athlete_id: hit.athlete_id, key: "MaxVelocity", value: hit.display_value });
  }
  const forty = new Map<string, number>();
  for (const row of derived) {
    if (!sameSpeedMark(row, FORTY_YD_DASH, FORTY_YD_PRIMARY_COMPONENT)) continue;
    const current = forty.get(row.athlete_id);
    if (current == null || row.display_value < current) forty.set(row.athlete_id, row.display_value);
  }
  for (const [athleteId, value] of forty) {
    marks.push({ athlete_id: athleteId, key: "40yd_Dash", value });
  }
  return marks;
}

function higherMarks(rows: NormEntry[]): BatteryMark[] {
  const best = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!(HIGHER_METRIC_KEYS as readonly string[]).includes(row.metric_key)) continue;
    let byKey = best.get(row.athlete_id);
    if (!byKey) {
      byKey = new Map();
      best.set(row.athlete_id, byKey);
    }
    const current = byKey.get(row.metric_key);
    if (current == null || row.display_value > current) byKey.set(row.metric_key, row.display_value);
  }
  const marks: BatteryMark[] = [];
  for (const [athleteId, byKey] of best) {
    for (const [key, value] of byKey) {
      marks.push({ athlete_id: athleteId, key, value });
    }
  }
  return marks;
}

function repeatMarks(rows: NormEntry[]): BatteryMark[] {
  const reps = rows.flatMap((row) => {
    if (row.metric_key !== "10x10m" || row.interval_index == null) return [];
    return [
      {
        athlete_id: row.athlete_id,
        raw_input: row.raw_input,
        interval_index: row.interval_index,
        value: row.display_value,
        created_at: row.created_at,
      },
    ];
  });
  const marks: BatteryMark[] = [];
  for (const [athleteId, times] of latestRepeatSeriesTimes(reps)) {
    const score = scoreRepeatSprint(times);
    if (!score) continue;
    marks.push(
      { athlete_id: athleteId, key: "10x10m_best", value: score.best },
      { athlete_id: athleteId, key: "10x10m_mean", value: score.mean },
      { athlete_id: athleteId, key: "10x10m_decrement", value: score.decrement }
    );
  }
  return marks;
}

function comparisonValues(rows: NormEntry[]): Map<string, Map<string, number>> {
  const derived = rows.map(toDerived);
  const out = new Map<string, Map<string, number>>();
  const put = (athleteId: string, key: string, value: number) => {
    let byKey = out.get(athleteId);
    if (!byKey) {
      byKey = new Map();
      out.set(athleteId, byKey);
    }
    byKey.set(key, value);
  };

  for (const hit of pickBestTwentyYdHits(derived)) {
    put(hit.athlete_id, "20yd_Dash", hit.display_value);
  }
  for (const hit of pickBestMaxVelocityHits(derived)) {
    put(hit.athlete_id, "MaxVelocity", hit.display_value);
  }
  for (const row of derived) {
    if (!sameSpeedMark(row, FORTY_YD_DASH, FORTY_YD_PRIMARY_COMPONENT)) continue;
    const current = out.get(row.athlete_id)?.get("40yd_Dash");
    if (current == null || row.display_value < current) {
      put(row.athlete_id, "40yd_Dash", row.display_value);
    }
  }
  for (const key of ["Standing-Broad", "OH-MB_Throw"] as const) {
    for (const row of derived) {
      if (row.metric_key !== key && row.legacy_metric_key !== key) continue;
      const current = out.get(row.athlete_id)?.get(key);
      if (current == null || row.display_value > current) put(row.athlete_id, key, row.display_value);
    }
  }
  return out;
}

function bestRsiQualifier(rows: NormEntry[]): Map<string, string | null> {
  const best = new Map<string, { value: number; qualifier: string | null }>();
  for (const row of rows) {
    if (row.metric_key !== "10-5_RSI") continue;
    const current = best.get(row.athlete_id);
    if (!current || row.display_value > current.value) {
      best.set(row.athlete_id, { value: row.display_value, qualifier: row.qualifier });
      continue;
    }
    if (row.display_value === current.value && current.qualifier == null && row.qualifier) {
      current.qualifier = row.qualifier;
    }
  }
  return new Map([...best].map(([athleteId, row]) => [athleteId, row.qualifier]));
}

function rememberAthlete(
  roster: Map<string, RosterAthlete>,
  athleteId: string,
  firstName: string,
  lastName: string,
  bib: string | null
) {
  const existing = roster.get(athleteId);
  if (!existing) {
    roster.set(athleteId, {
      athlete_id: athleteId,
      first_name: firstName,
      last_name: lastName,
      bib,
    });
    return;
  }
  if (!existing.first_name && firstName) existing.first_name = firstName;
  if (!existing.last_name && lastName) existing.last_name = lastName;
  if (existing.bib == null && bib != null) existing.bib = bib;
}

function singleGroupKey(groupsByAthlete: Map<string, Set<string>>, athleteId: string): string | null {
  const keys = groupsByAthlete.get(athleteId);
  if (!keys || keys.size !== 1) return null;
  return [...keys][0] ?? null;
}

function lockedDriBox(days: DayRow[]): string | null {
  const dayA = days.find((day) => day.day_key === "A");
  if (dayA?.locked_dri_box == null) return null;
  const trimmed = String(dayA.locked_dri_box).trim();
  return trimmed === "" ? null : trimmed;
}

export async function loadBatteryBoard(
  batteryId: string,
  options: { view: "today" | "meet"; group: string; dayKeys?: readonly string[] }
): Promise<BoardPayload | null> {
  const batteryResult = await sql`
    SELECT id, title, hugo_group, grouping_mode, cutoff_n, comparison_session_id
    FROM testing_batteries
    WHERE id = ${batteryId}
    LIMIT 1
  `;
  if (!batteryResult.rows.length) return null;
  const battery = batteryResult.rows[0] as BatteryRow;

  const [dayResult, bibResult, groupResult, memberResult, hugoAthletes] = await Promise.all([
    sql`
      SELECT day_key, label, session_id, sort_order, closed_at, locked_dri_box
      FROM testing_battery_days
      WHERE battery_id = ${battery.id}
      ORDER BY sort_order ASC, day_key ASC
    `,
    sql`
      SELECT b.athlete_id, b.bib, a.first_name, a.last_name
      FROM testing_battery_bibs b
      INNER JOIN athletes a ON a.id = b.athlete_id
      WHERE b.battery_id = ${battery.id}
    `,
    sql`
      SELECT group_key, label
      FROM testing_battery_groups
      WHERE battery_id = ${battery.id}
      ORDER BY sort_order ASC, group_key ASC
    `,
    sql`
      SELECT m.athlete_id, g.group_key
      FROM testing_battery_group_members m
      INNER JOIN testing_battery_groups g ON g.id = m.group_id
      WHERE g.battery_id = ${battery.id}
    `,
    loadHugoAthletes(battery.hugo_group),
  ]);

  const days = (dayResult.rows as DayRow[])
    .map((day) => ({
      day_key: String(day.day_key),
      label: asText(day.label).trim(),
      session_id: day.session_id == null ? null : String(day.session_id),
      sort_order: Number(day.sort_order),
      closed_at: day.closed_at,
      locked_dri_box: day.locked_dri_box == null ? null : String(day.locked_dri_box),
    }))
    .toSorted((a, b) => a.sort_order - b.sort_order || a.day_key.localeCompare(b.day_key));

  const basketballSessionIds = days.flatMap((day) => (day.session_id ? [day.session_id] : []));
  const basketballSessions = new Set(basketballSessionIds);
  const comparisonSessionId =
    battery.comparison_session_id == null ? null : String(battery.comparison_session_id);
  const sessionIds = [...new Set([...basketballSessionIds, ...(comparisonSessionId ? [comparisonSessionId] : [])])];
  const entries = await loadEntries(sessionIds);
  const basketballRows = entries.filter((row) => basketballSessions.has(row.session_id));
  const comparisonRows =
    comparisonSessionId == null
      ? []
      : entries.filter((row) => row.session_id === comparisonSessionId);

  const roster = new Map<string, RosterAthlete>();
  for (const athlete of hugoAthletes) {
    rememberAthlete(roster, String(athlete.id), asText(athlete.first_name), asText(athlete.last_name), null);
  }
  for (const bib of bibResult.rows as {
    athlete_id: string;
    bib: string | number | null;
    first_name: string;
    last_name: string;
  }[]) {
    rememberAthlete(
      roster,
      String(bib.athlete_id),
      asText(bib.first_name),
      asText(bib.last_name),
      bib.bib == null ? null : String(bib.bib)
    );
  }
  for (const row of basketballRows) {
    rememberAthlete(roster, row.athlete_id, row.first_name, row.last_name, null);
  }

  const groups = (groupResult.rows as { group_key: string; label: string }[]).map((row) => ({
    group_key: String(row.group_key),
    label: asText(row.label).trim() || String(row.group_key),
  }));
  const knownGroups = new Set(groups.map((group) => group.group_key));
  const membersByGroup = new Map<string, string[]>();
  const groupsByAthlete = new Map<string, Set<string>>();
  for (const row of memberResult.rows as { athlete_id: string; group_key: string }[]) {
    const athleteId = String(row.athlete_id);
    const groupKey = String(row.group_key);
    const members = membersByGroup.get(groupKey);
    if (members) members.push(athleteId);
    else membersByGroup.set(groupKey, [athleteId]);
    const athleteGroups = groupsByAthlete.get(athleteId);
    if (athleteGroups) athleteGroups.add(groupKey);
    else groupsByAthlete.set(athleteId, new Set([groupKey]));
  }

  const todayDay = days.find((day) => day.closed_at == null) ?? days[days.length - 1] ?? null;
  // Today is the open day, even before its session is linked. Do not fall back to an
  // earlier closed day. Closed days stay on the meet so Wednesday does not sort by Monday.
  const meetRows = basketballRows.filter(
    (row) => comparisonSessionId == null || row.session_id !== comparisonSessionId
  );
  // A meet can be limited to named days. Friday lanes use A and B so day C reps do not move places.
  const meetDayKeys =
    options.view === "meet" && options.dayKeys != null && options.dayKeys.length > 0
      ? new Set(options.dayKeys)
      : null;
  const scoringSessionIds =
    meetDayKeys == null
      ? null
      : new Set(
          days.flatMap((day) =>
            meetDayKeys.has(day.day_key) && day.session_id != null ? [day.session_id] : []
          )
        );
  const scoringRows =
    options.view === "today"
      ? meetRows.filter(
          (row) => todayDay?.session_id != null && row.session_id === todayDay.session_id
        )
      : scoringSessionIds == null
        ? meetRows
        : meetRows.filter((row) => scoringSessionIds.has(row.session_id));

  const todayKeys = todayDay
    ? new Set(expandedDayKeys(testsForDay(todayDay.day_key)))
    : new Set<string>();
  const dayA = days.find((day) => day.day_key === "A") ?? null;
  const dayARows = meetRows.filter(
    (row) => dayA?.session_id != null && row.session_id === dayA.session_id
  );
  const dayADri = bestDriPerAthleteBox(
    dayARows.flatMap((row) => {
      if (row.metric_key !== "DRI" || row.component == null || row.component.trim() === "") return [];
      return [{ athlete_id: row.athlete_id, box: row.component, value: row.display_value }];
    })
  );
  const scoreDri =
    options.view === "meet"
      ? meetDayKeys == null || meetDayKeys.has("A")
      : todayKeys.has("DRI");

  const lockedBox = lockedDriBox(days);
  const teamBox = lockedBox ?? pickTeamDriBox([...dayADri.values()].flat());
  // Today only scores that day's tests. A vertical saved on Monday must not
  // add points or pull the athlete out of untested.
  const marks = [
    ...higherMarks(scoringRows),
    ...sprintMarks(scoringRows),
    ...repeatMarks(scoringRows),
  ].filter((mark) => options.view !== "today" || todayKeys.has(mark.key));
  const poolIds =
    options.group === "overall"
      ? undefined
      : knownGroups.has(options.group)
        ? (membersByGroup.get(options.group) ?? [])
        : [];

  const scored = scoreBatteryRows({
    athletes: [...roster.values()].map((athlete) => ({
      athlete_id: athlete.athlete_id,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      dri_marks: scoreDri ? (dayADri.get(athlete.athlete_id) ?? []) : [],
    })),
    marks,
    teamBox,
    poolIds,
  });

  const previousByAthlete = comparisonValues(comparisonRows);
  const includeMondayQualifier =
    options.view === "meet"
      ? meetDayKeys == null || meetDayKeys.has("A")
      : todayKeys.has("10-5_RSI");
  const qualifierByAthlete = includeMondayQualifier
    ? bestRsiQualifier(scoringRows)
    : new Map<string, string>();
  const athletes: BoardAthlete[] = scored.map((row) => {
    const cells: Record<string, BoardCell> = {};
    const previous = previousByAthlete.get(row.athlete_id);
    for (const [key, cell] of Object.entries(row.cells)) {
      const next: BoardCell = {
        value: cell.value,
        rank: cell.rank,
        tied: cell.tied,
        points: cell.points,
      };
      if (cell.band != null) next.band = cell.band;
      if (SHARED_SOCCER_KEYS.has(key)) {
        const delta = compareMark(key, cell.value, previous?.get(key) ?? null);
        if (delta) next.delta = delta;
      }
      cells[key] = next;
    }
    const rosterAthlete = roster.get(row.athlete_id);
    return {
      athlete_id: row.athlete_id,
      bib: rosterAthlete?.bib ?? null,
      first_name: row.first_name,
      last_name: row.last_name,
      group_key: singleGroupKey(groupsByAthlete, row.athlete_id),
      total_points: row.total_points,
      slots_completed: row.slots_completed,
      qualifier: qualifierByAthlete.get(row.athlete_id) ?? null,
      higher_box: row.higher_box,
      cells,
    };
  });

  const present = keysWithCells(scored);
  const columnKeys =
    options.view === "meet"
      ? meetColumnKeys(present, present.has("40yd_Dash") || hasFortyEntry(scoringRows))
      : todayDay
        ? expandedDayKeys(testsForDay(todayDay.day_key))
        : [];
  const columns = columnKeys.map((key) => columnFor(key, teamBox));
  const viewKeys = new Set(columns.map((column) => column.key));
  const untestedIds = athletes
    .filter((athlete) => !Object.keys(athlete.cells).some((key) => viewKeys.has(key)))
    .map((athlete) => athlete.athlete_id);

  const cutoff = finiteNumber(battery.cutoff_n);

  return {
    battery: {
      id: String(battery.id),
      title: asText(battery.title),
      grouping_mode: asText(battery.grouping_mode),
      cutoff_n: cutoff,
      team_dri_box: teamBox,
      team_dri_locked: lockedBox != null,
    },
    view: options.view,
    day_label: options.view === "meet" ? "Meet" : asText(todayDay?.label).trim(),
    groups,
    columns,
    athletes,
    untested_ids: untestedIds,
  };
}
