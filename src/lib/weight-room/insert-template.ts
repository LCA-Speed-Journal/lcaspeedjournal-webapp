import { sql } from "@/lib/db";
import { isHugoGroup, type HugoGroup } from "./constants";
import type { CsvImportTemplate } from "./csv-import";
import type { CardDraft } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TEMPLATE_HAS_LOGS_ERROR =
  "Cannot modify a template that has session logs";

export type MovementInsertInput = {
  sort_index: number;
  label: string;
  name: string;
  block: string;
  set_count: number;
  targets: string[];
  notes: string;
  from_pair: boolean;
};

export type TemplateInsertInput = {
  hugo_group: HugoGroup;
  week_number: number | null;
  day_name: string;
  session_date: string;
  focus: string;
  title: string;
  movements: MovementInsertInput[];
};

export type WorkoutMovementRow = {
  id: string;
  template_id: string;
  sort_index: number;
  label: string;
  name: string;
  block: string;
  set_count: number;
  targets: string[];
  notes: string;
  from_pair: boolean;
};

export type WorkoutTemplateRow = {
  id: string;
  hugo_group: string;
  week_number: number | null;
  day_name: string | null;
  session_date: string;
  focus: string;
  title: string;
  layout: string;
  created_at: string;
  movement_count?: number;
};

export type TemplateWithMovements = WorkoutTemplateRow & {
  movements: WorkoutMovementRow[];
};

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** YYYY-MM-DD with a midday-UTC round-trip so 2026-02-30 is rejected. */
export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (!ISO_DATE.test(t)) return false;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === t;
}

export function serializeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return String(value ?? "");
}

export function normalizeTargets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((t) => String(t));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t));
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function serializeTemplateRow(
  row: Record<string, unknown>
): WorkoutTemplateRow {
  const out: WorkoutTemplateRow = {
    id: String(row.id),
    hugo_group: String(row.hugo_group),
    week_number: row.week_number == null ? null : Number(row.week_number),
    day_name: row.day_name == null ? null : String(row.day_name),
    session_date: serializeDate(row.session_date),
    focus: String(row.focus),
    title: String(row.title),
    layout: String(row.layout ?? "landscape-letter"),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ""),
  };
  if (row.movement_count != null) {
    out.movement_count = Number(row.movement_count);
  }
  return out;
}

export function serializeMovement(
  row: Record<string, unknown>
): WorkoutMovementRow {
  return {
    id: String(row.id),
    template_id: String(row.template_id),
    sort_index: Number(row.sort_index),
    label: row.label == null ? "" : String(row.label),
    name: String(row.name),
    block: String(row.block),
    set_count: Number(row.set_count),
    targets: normalizeTargets(row.targets),
    notes: row.notes == null ? "" : String(row.notes),
    from_pair: Boolean(row.from_pair),
  };
}

export function parseMovements(raw: unknown): ParseResult<MovementInsertInput[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "movements must be an array" };
  }

  const movements: MovementInsertInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      return { ok: false, error: `movements[${i}] must be an object` };
    }
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const block = typeof rec.block === "string" ? rec.block.trim() : "";
    if (!name) {
      return { ok: false, error: `movements[${i}].name is required` };
    }
    if (!block) {
      return { ok: false, error: `movements[${i}].block is required` };
    }

    const setCount = rec.set_count;
    if (typeof setCount !== "number" || !Number.isInteger(setCount) || setCount < 0) {
      return {
        ok: false,
        error: `movements[${i}].set_count must be a non-negative integer`,
      };
    }
    if (
      !Array.isArray(rec.targets) ||
      !rec.targets.every((t) => typeof t === "string")
    ) {
      return {
        ok: false,
        error: `movements[${i}].targets must be an array of strings`,
      };
    }
    if (rec.targets.length !== setCount) {
      return {
        ok: false,
        error: `movements[${i}]: set_count ${setCount} does not match ${rec.targets.length} target(s)`,
      };
    }

    const sortIndex =
      typeof rec.sort_index === "number" && Number.isInteger(rec.sort_index)
        ? rec.sort_index
        : i;

    movements.push({
      sort_index: sortIndex,
      label: typeof rec.label === "string" ? rec.label : "",
      name,
      block,
      set_count: setCount,
      targets: rec.targets as string[],
      notes: typeof rec.notes === "string" ? rec.notes : "",
      from_pair: rec.from_pair === undefined ? false : Boolean(rec.from_pair),
    });
  }

  return { ok: true, value: movements };
}

function parseWeekNumber(raw: unknown): ParseResult<number | null> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { ok: false, error: "week_number must be a number or null" };
  }
  return { ok: true, value: raw };
}

export function parseTemplatePayload(raw: unknown): ParseResult<TemplateInsertInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "template must be an object" };
  }
  const rec = raw as Record<string, unknown>;
  if (!isHugoGroup(rec.hugo_group)) {
    return {
      ok: false,
      error: "hugo_group is required and must be a valid Hugo group",
    };
  }
  if (!isIsoCalendarDate(rec.session_date)) {
    return { ok: false, error: "session_date must be YYYY-MM-DD" };
  }
  const focus = typeof rec.focus === "string" ? rec.focus.trim() : "";
  const title = typeof rec.title === "string" ? rec.title.trim() : "";
  if (!focus) {
    return { ok: false, error: "focus is required" };
  }
  if (!title) {
    return { ok: false, error: "title is required" };
  }
  const week = parseWeekNumber(rec.week_number);
  if (!week.ok) return week;
  if (rec.day_name !== undefined && typeof rec.day_name !== "string") {
    return { ok: false, error: "day_name must be a string" };
  }
  const movements = parseMovements(rec.movements);
  if (!movements.ok) return movements;

  return {
    ok: true,
    value: {
      hugo_group: rec.hugo_group,
      week_number: week.value,
      day_name: typeof rec.day_name === "string" ? rec.day_name : "",
      session_date: rec.session_date.trim(),
      focus,
      title,
      movements: movements.value,
    },
  };
}

export type TemplatePatchInput = {
  hugo_group?: HugoGroup;
  week_number?: number | null;
  day_name?: string;
  session_date?: string;
  focus?: string;
  title?: string;
  movements?: MovementInsertInput[];
};

export function parseTemplatePatch(raw: unknown): ParseResult<TemplatePatchInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const rec = raw as Record<string, unknown>;
  const patch: TemplatePatchInput = {};
  let hasField = false;

  if ("hugo_group" in rec) {
    if (!isHugoGroup(rec.hugo_group)) {
      return {
        ok: false,
        error: "hugo_group must be a valid Hugo group",
      };
    }
    patch.hugo_group = rec.hugo_group;
    hasField = true;
  }
  if ("session_date" in rec) {
    if (!isIsoCalendarDate(rec.session_date)) {
      return { ok: false, error: "session_date must be YYYY-MM-DD" };
    }
    patch.session_date = rec.session_date.trim();
    hasField = true;
  }
  if ("focus" in rec) {
    if (typeof rec.focus !== "string" || !rec.focus.trim()) {
      return { ok: false, error: "focus is required" };
    }
    patch.focus = rec.focus.trim();
    hasField = true;
  }
  if ("title" in rec) {
    if (typeof rec.title !== "string" || !rec.title.trim()) {
      return { ok: false, error: "title is required" };
    }
    patch.title = rec.title.trim();
    hasField = true;
  }
  if ("day_name" in rec) {
    if (typeof rec.day_name !== "string") {
      return { ok: false, error: "day_name must be a string" };
    }
    patch.day_name = rec.day_name;
    hasField = true;
  }
  if ("week_number" in rec) {
    const week = parseWeekNumber(rec.week_number);
    if (!week.ok) return week;
    patch.week_number = week.value;
    hasField = true;
  }
  if ("movements" in rec) {
    const movements = parseMovements(rec.movements);
    if (!movements.ok) return movements;
    patch.movements = movements.value;
    hasField = true;
  }

  if (!hasField) {
    return {
      ok: false,
      error:
        "Provide title, focus, session_date, day_name, week_number, hugo_group, and/or movements",
    };
  }
  return { ok: true, value: patch };
}

export function templateFromCsv(t: CsvImportTemplate): TemplateInsertInput {
  return {
    hugo_group: t.hugo_group,
    week_number: t.week_number,
    day_name: t.day_name,
    session_date: t.session_date,
    focus: t.focus,
    title: t.title,
    movements: t.movements.map((m) => ({
      sort_index: m.sort_index,
      label: m.label,
      name: m.name,
      block: m.block,
      set_count: m.set_count,
      targets: m.targets,
      notes: m.notes,
      from_pair: false,
    })),
  };
}

export type CsvTemplateImportError = {
  row?: number;
  message: string;
};

/**
 * Same guards as JSON POST `{ template }`. Skips empty templates.
 * Invalid ones are not inserted — they become errors instead of a 500.
 */
export function validateCsvImportTemplates(
  csvTemplates: CsvImportTemplate[]
): {
  ok: true;
  templates: TemplateInsertInput[];
  errors: CsvTemplateImportError[];
} {
  const templates: TemplateInsertInput[] = [];
  const errors: CsvTemplateImportError[] = [];
  for (const t of csvTemplates) {
    if (t.movements.length === 0) continue;
    const parsed = parseTemplatePayload({
      hugo_group: t.hugo_group,
      week_number: t.week_number,
      day_name: t.day_name,
      session_date: t.session_date,
      focus: t.focus,
      title: t.title,
      movements: t.movements,
    });
    if (!parsed.ok) {
      errors.push({
        message: `${t.hugo_group} ${t.session_date} (${t.focus || "untitled"}): ${parsed.error}`,
      });
      continue;
    }
    templates.push(parsed.value);
  }
  return { ok: true, templates, errors };
}

export function templateFromDraft(draft: CardDraft): TemplateInsertInput {
  return {
    hugo_group: draft.hugoGroup,
    week_number: draft.weekNumber,
    day_name: draft.dayName,
    session_date: draft.sessionDate,
    focus: draft.focus,
    title: draft.title,
    movements: draft.movements.map((m, i) => ({
      sort_index: i,
      label: m.label,
      name: m.name,
      block: m.block,
      set_count: m.setCount,
      targets: m.targets,
      notes: m.notes,
      from_pair: m.fromPair,
    })),
  };
}

/** Inverse of templateFromDraft. exerciseHtml is not stored on movements. */
export function draftFromTemplate(template: TemplateWithMovements): CardDraft {
  const hugoGroup: HugoGroup = isHugoGroup(template.hugo_group)
    ? template.hugo_group
    : "extracurricular";
  return {
    hugoGroup,
    weekNumber: template.week_number,
    dayName: template.day_name ?? "",
    sessionDate: template.session_date,
    focus: template.focus,
    title: template.title,
    movements: template.movements.map((m) => ({
      label: m.label,
      name: m.name,
      block: m.block,
      setCount: m.set_count,
      targets: [...m.targets],
      notes: m.notes,
      fromPair: m.from_pair,
      exerciseHtml: null,
    })),
  };
}

async function insertMovements(
  templateId: string,
  movements: MovementInsertInput[]
): Promise<WorkoutMovementRow[]> {
  const inserted: WorkoutMovementRow[] = [];
  for (const m of movements) {
    const movementId = crypto.randomUUID();
    const targetsJson = JSON.stringify(m.targets);
    const { rows } = await sql`
      INSERT INTO workout_movements (
        id, template_id, sort_index, label, name, block, set_count, targets, notes, from_pair
      )
      VALUES (
        ${movementId},
        ${templateId},
        ${m.sort_index},
        ${m.label},
        ${m.name},
        ${m.block},
        ${m.set_count},
        ${targetsJson},
        ${m.notes},
        ${m.from_pair}
      )
      RETURNING id, template_id, sort_index, label, name, block, set_count, targets, notes, from_pair
    `;
    inserted.push(serializeMovement(rows[0] as Record<string, unknown>));
  }
  return inserted;
}

export async function insertTemplateWithMovements(
  input: TemplateInsertInput
): Promise<TemplateWithMovements> {
  const id = crypto.randomUUID();
  const { rows } = await sql`
    INSERT INTO workout_templates (
      id, hugo_group, week_number, day_name, session_date, focus, title
    )
    VALUES (
      ${id},
      ${input.hugo_group},
      ${input.week_number},
      ${input.day_name},
      ${input.session_date},
      ${input.focus},
      ${input.title}
    )
    RETURNING id, hugo_group, week_number, day_name, session_date, focus, title, layout, created_at
  `;
  const template = serializeTemplateRow(rows[0] as Record<string, unknown>);

  try {
    const movements = await insertMovements(id, input.movements);
    return { ...template, movements };
  } catch (err) {
    try {
      await sql`DELETE FROM workout_templates WHERE id = ${id}`;
    } catch (cleanupErr) {
      console.error(
        "Failed to roll back workout_templates row after movement insert error:",
        id,
        cleanupErr
      );
    }
    throw err;
  }
}

export async function replaceTemplateMovements(
  templateId: string,
  movements: MovementInsertInput[]
): Promise<WorkoutMovementRow[]> {
  await sql`DELETE FROM workout_movements WHERE template_id = ${templateId}`;
  return insertMovements(templateId, movements);
}

export async function getTemplateWithMovements(
  id: string
): Promise<TemplateWithMovements | null> {
  const templatePromise = sql`
    SELECT id, hugo_group, week_number, day_name, session_date, focus, title, layout, created_at
    FROM workout_templates
    WHERE id = ${id}
    LIMIT 1
  `;
  const movementsPromise = sql`
    SELECT id, template_id, sort_index, label, name, block, set_count, targets, notes, from_pair
    FROM workout_movements
    WHERE template_id = ${id}
    ORDER BY sort_index
  `;
  const [templateResult, movementsResult] = await Promise.all([
    templatePromise,
    movementsPromise,
  ]);
  if (templateResult.rows.length === 0) {
    return null;
  }
  return {
    ...serializeTemplateRow(templateResult.rows[0] as Record<string, unknown>),
    movements: (movementsResult.rows as Record<string, unknown>[]).map(
      serializeMovement
    ),
  };
}

export async function templateHasSessionLogs(id: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM session_logs WHERE template_id = ${id} LIMIT 1
  `;
  return rows.length > 0;
}

export async function updateTemplateFields(
  id: string,
  current: WorkoutTemplateRow,
  patch: TemplatePatchInput
): Promise<WorkoutTemplateRow> {
  const hugoGroup = patch.hugo_group ?? current.hugo_group;
  const weekNumber =
    patch.week_number !== undefined ? patch.week_number : current.week_number;
  const dayName =
    patch.day_name !== undefined ? patch.day_name : (current.day_name ?? "");
  const sessionDate = patch.session_date ?? current.session_date;
  const focus = patch.focus ?? current.focus;
  const title = patch.title ?? current.title;

  const { rows } = await sql`
    UPDATE workout_templates
    SET
      hugo_group = ${hugoGroup},
      week_number = ${weekNumber},
      day_name = ${dayName},
      session_date = ${sessionDate},
      focus = ${focus},
      title = ${title}
    WHERE id = ${id}
    RETURNING id, hugo_group, week_number, day_name, session_date, focus, title, layout, created_at
  `;
  return serializeTemplateRow(rows[0] as Record<string, unknown>);
}
