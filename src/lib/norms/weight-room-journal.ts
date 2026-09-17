import { sql } from "@/lib/db";
import { isFortyYardComponent } from "@/lib/norms/forty-yd";
import { getMetricsRegistry, parseEntry, parseFortyYardComponent, type ParsedEntry } from "@/lib/parser";
import {
  applyJournalPosts,
  buildJournalPostCandidates,
  type CellOutput,
  type JournalMovement,
  type JournalPostChoice,
} from "./journal-posts";

export type ParseJournalPostsOk = { ok: true; value: JournalPostChoice[] };
export type ParseJournalPostsErr = { ok: false; error: string };
export type ParseJournalPostsResult = ParseJournalPostsOk | ParseJournalPostsErr;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJournalPostItem(value: unknown): JournalPostChoice | null {
  if (!isRecord(value)) return null;
  if (typeof value.movement_id !== "string") return null;
  if (typeof value.metric_key !== "string") return null;
  if (typeof value.post !== "boolean") return null;
  const component =
    typeof value.component === "string" && value.component.trim() !== ""
      ? value.component.trim()
      : null;
  return {
    movement_id: value.movement_id,
    metric_key: value.metric_key,
    component,
    post: value.post,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Request failed";
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return asStringArray(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Parse confirm JSON `journal_posts`. Missing/null → []. Non-array → error. Invalid items ignored. */
export function parseJournalPostsBody(raw: unknown): ParseJournalPostsResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "journal_posts must be an array" };
  }
  const value: JournalPostChoice[] = [];
  for (const item of raw) {
    const parsed = parseJournalPostItem(item);
    if (parsed) value.push(parsed);
  }
  return { ok: true, value };
}

export async function findOrCreateWeightRoomSession(
  sessionDate: string,
  postedKeys: string[]
): Promise<string> {
  const { rows: existing } = await sql`
    SELECT id, day_metrics FROM sessions
    WHERE session_date = ${sessionDate}
      AND origin = ${"weight_room"}
    LIMIT 1
  `;
  const found = existing[0] as { id: unknown; day_metrics?: unknown } | undefined;
  if (found) {
    const id = String(found.id);
    const existingKeys = asStringArray(found.day_metrics);
    const merged = [...new Set([...existingKeys, ...postedKeys])];
    if (merged.some((key) => !existingKeys.includes(key))) {
      await sql`
        UPDATE sessions
        SET day_metrics = ${JSON.stringify(merged)}
        WHERE id = ${id}
      `;
    }
    return id;
  }

  const dayMetricsJson = JSON.stringify([...new Set(postedKeys)]);
  const { rows: created } = await sql`
    INSERT INTO sessions (session_date, phase, phase_week, day_metrics, origin)
    VALUES (
      ${sessionDate},
      ${"Competition"},
      ${1},
      ${dayMetricsJson},
      ${"weight_room"}
    )
    RETURNING id
  `;
  return String((created[0] as { id: string }).id);
}

export async function upsertWeightRoomEntry(input: {
  sessionId: string;
  athleteId: string;
  parsed: ParsedEntry;
  rawInput: string;
}): Promise<string> {
  const { rows: updated } = await sql`
    UPDATE entries
    SET
      interval_index = ${input.parsed.interval_index},
      component = ${input.parsed.component},
      value = ${input.parsed.value},
      display_value = ${input.parsed.display_value},
      units = ${input.parsed.units},
      raw_input = ${input.rawInput}
    WHERE session_id = ${input.sessionId}
      AND athlete_id = ${input.athleteId}
      AND metric_key = ${input.parsed.metric_key}
      AND COALESCE(component, '') = ${input.parsed.component ?? ""}
      AND source = ${"weight_room"}
    RETURNING id
  `;
  if (updated[0]) {
    return String((updated[0] as { id: string }).id);
  }

  const { rows: inserted } = await sql`
    INSERT INTO entries (
      session_id, athlete_id, metric_key,
      interval_index, component,
      value, display_value, units, raw_input, source
    )
    VALUES (
      ${input.sessionId},
      ${input.athleteId},
      ${input.parsed.metric_key},
      ${input.parsed.interval_index},
      ${input.parsed.component},
      ${input.parsed.value},
      ${input.parsed.display_value},
      ${input.parsed.units},
      ${input.rawInput},
      ${"weight_room"}
    )
    RETURNING id
  `;
  return String((inserted[0] as { id: string }).id);
}

/** Presence key for athlete+date entry lookup: metric + optional component. */
export function entryPresenceKey(
  metricKey: string,
  component: string | null | undefined
): string {
  return `${metricKey}::${component ?? ""}`;
}

/**
 * Decide which mapped movements should dual-write when filling missing journal entries.
 * Unmapped / empty metric keys are skipped. Existing keys get post:false (or omit is also OK for callers that filter).
 */
export function journalPostsForFillIfMissing(input: {
  movements: {
    id: string;
    speed_journal_metric_key: string | null;
    speed_journal_component?: string | null;
  }[];
  existingKeys: Set<string>;
}): JournalPostChoice[] {
  const posts: JournalPostChoice[] = [];
  for (const movement of input.movements) {
    const metricKey = movement.speed_journal_metric_key?.trim() ?? "";
    if (!metricKey) continue;
    const component =
      typeof movement.speed_journal_component === "string" &&
      movement.speed_journal_component.trim() !== ""
        ? movement.speed_journal_component.trim()
        : null;
    const key = entryPresenceKey(metricKey, component);
    posts.push({
      movement_id: movement.id,
      metric_key: metricKey,
      component,
      post: !input.existingKeys.has(key),
    });
  }
  return posts;
}

/** Any entry for athlete+date+metric(+component) blocks fill, regardless of source. */
export async function loadExistingEntryKeysForAthleteDate(
  athleteId: string,
  sessionDate: string
): Promise<Set<string>> {
  const { rows } = await sql`
    SELECT e.metric_key, e.component
    FROM entries e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.athlete_id = ${athleteId}
      AND s.session_date = ${sessionDate}
  `;
  const keys = new Set<string>();
  for (const row of rows as { metric_key: unknown; component: unknown }[]) {
    const metricKey = String(row.metric_key ?? "");
    if (!metricKey) continue;
    const component =
      typeof row.component === "string" && row.component.trim() !== ""
        ? row.component.trim()
        : null;
    keys.add(entryPresenceKey(metricKey, component));
  }
  return keys;
}

/**
 * Dual-write mapped weight-room outputs to Speed Journal only when that
 * athlete has no entry yet for the date + metric (+ component).
 */
export async function dualWriteWeightRoomJournalFillIfMissing(input: {
  sessionDate: string;
  athleteId: string;
  movements: JournalMovement[];
  outputs: CellOutput[];
}): Promise<{ journal_warnings: string[]; journal_entry_ids: string[] }> {
  const existingKeys = await loadExistingEntryKeysForAthleteDate(
    input.athleteId,
    input.sessionDate
  );
  const posts = journalPostsForFillIfMissing({
    movements: input.movements,
    existingKeys,
  }).filter((p) => p.post);
  if (posts.length === 0) {
    return { journal_warnings: [], journal_entry_ids: [] };
  }
  return dualWriteWeightRoomJournal({
    sessionDate: input.sessionDate,
    athleteId: input.athleteId,
    movements: input.movements,
    outputs: input.outputs,
    posts,
  });
}

export async function dualWriteWeightRoomJournal(input: {
  sessionDate: string;
  athleteId: string;
  movements: JournalMovement[];
  outputs: CellOutput[];
  posts: JournalPostChoice[];
}): Promise<{ journal_warnings: string[]; journal_entry_ids: string[] }> {
  const journal_warnings: string[] = [];
  const journal_entry_ids: string[] = [];
  const registry = getMetricsRegistry();
  const candidates = buildJournalPostCandidates({
    movements: input.movements,
    outputs: input.outputs,
    lowerIsBetterFor: (key) =>
      Boolean(key) && registry[key ?? ""]?.display_units === "s",
  });
  const posted = applyJournalPosts(candidates, input.posts);
  if (posted.length === 0) {
    return { journal_warnings, journal_entry_ids };
  }

  let sessionId: string;
  try {
    sessionId = await findOrCreateWeightRoomSession(
      input.sessionDate,
      posted.map((item) => item.metric_key)
    );
  } catch (err) {
    journal_warnings.push(`Speed Journal session: ${errorMessage(err)}`);
    return { journal_warnings, journal_entry_ids };
  }

  for (const item of posted) {
    try {
      const rows =
        item.metric_key === "40yd_Dash"
          ? isFortyYardComponent(item.component)
            ? [parseFortyYardComponent(String(item.best_value), item.component)]
            : []
          : parseEntry(item.metric_key, String(item.best_value));
      if (item.metric_key === "40yd_Dash" && rows.length === 0) {
        journal_warnings.push(`${item.metric_key}: pick a 40yd split`);
        continue;
      }
      const row = rows[0];
      if (!row) {
        journal_warnings.push(`${item.metric_key}: no parsed row`);
        continue;
      }
      const id = await upsertWeightRoomEntry({
        sessionId,
        athleteId: input.athleteId,
        parsed: row,
        rawInput: String(item.best_value),
      });
      journal_entry_ids.push(id);
    } catch (err) {
      journal_warnings.push(`${item.metric_key}: ${errorMessage(err)}`);
    }
  }

  return { journal_warnings, journal_entry_ids };
}
