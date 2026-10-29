import { splitWarmupDrills } from "./split-warmup-drills";
import { splitComplexName } from "./split-complex-name";
import {
  buildConfirmPayload,
  cellKey,
  type ConfirmLogPayload,
  type ConfirmResultPayload,
} from "./confirm-scan";
import type { MovementInsertInput } from "./insert-template";

export type ManualLogGridRow = {
  source: "template" | "warmup_expand" | "complex_split";
  movementId: string | null;
  /** When complex_split: original template movement to omit from this save */
  parentMovementId?: string | null;
  setIndex: number;
  defaultText: string;
  name: string;
  block?: string;
  label?: string;
};

export type TemplateMovementForGrid = {
  id: string;
  name: string;
  block: string;
  set_count: number;
  targets: string[];
  notes: string;
  label: string;
};

/**
 * Resolve an athlete cell against the row default.
 * - undefined override → inherit default
 * - "" → skip (null)
 * - otherwise → use override
 */
export function resolveAthleteCell(
  defaultText: string,
  override: string | undefined
): string | null {
  if (override === undefined) return defaultText;
  if (override === "") return null;
  return override;
}

/**
 * Expand template movements into spreadsheet grid rows.
 * Zero-set warmup notes become per-drill provisional rows (no blob row).
 */
export function buildGridRowsFromTemplate(
  movements: TemplateMovementForGrid[]
): ManualLogGridRow[] {
  const rows: ManualLogGridRow[] = [];

  for (const movement of movements) {
    if (movement.set_count > 0) {
      const parts = splitComplexName(movement.name);
      if (parts.length > 1) {
        for (const part of parts) {
          for (let setIndex = 0; setIndex < movement.set_count; setIndex++) {
            rows.push({
              source: "complex_split",
              movementId: null,
              parentMovementId: movement.id,
              setIndex,
              defaultText: movement.targets[setIndex] ?? "",
              name: part,
              block: movement.block,
              label: movement.label,
            });
          }
        }
        continue;
      }

      for (let setIndex = 0; setIndex < movement.set_count; setIndex++) {
        rows.push({
          source: "template",
          movementId: movement.id,
          setIndex,
          defaultText: movement.targets[setIndex] ?? "",
          name: movement.name,
          block: movement.block,
          label: movement.label,
        });
      }
      continue;
    }

    const notes = movement.notes?.trim() ?? "";
    if (!notes) continue;

    for (const drill of splitWarmupDrills(notes)) {
      rows.push({
        source: "warmup_expand",
        movementId: null,
        parentMovementId: movement.id,
        setIndex: 0,
        defaultText: drill.dose,
        name: drill.name,
        block: movement.block,
        label: movement.label,
      });
    }
  }

  return rows;
}

/**
 * Card movements whose notes or complex name are expanded into provisional
 * rows. Saving the sheet retires these so the next open does not expand them
 * again over the coach's edits.
 */
export function expansionSourceIds(
  movements: TemplateMovementForGrid[]
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of buildGridRowsFromTemplate(movements)) {
    if (row.source === "template") continue;
    const parentId = row.parentMovementId;
    if (!parentId || seen.has(parentId)) continue;
    seen.add(parentId);
    ids.push(parentId);
  }
  return ids;
}

export type MovementOmitInput = {
  id: string;
  name: string;
  block: string;
  set_count: number;
  notes: string;
  log_suppressed?: boolean;
};

/**
 * Movements to leave off the manual-log sheet.
 * A fresh card (nothing logged yet) still expands. Once sets exist, don't
 * bring back exercises the coach removed, and don't re-expand a warmup blob
 * or complex that was already saved as its own rows.
 */
export function movementIdsToOmitOnLoad(
  movements: MovementOmitInput[],
  loggedMovementIds: ReadonlySet<string>
): string[] {
  const omit = new Set<string>();
  for (const movement of movements) {
    if (movement.log_suppressed) omit.add(movement.id);
  }
  if (loggedMovementIds.size === 0) {
    return movements.filter((m) => omit.has(m.id)).map((m) => m.id);
  }

  const logged = movements.filter((m) => loggedMovementIds.has(m.id));
  const loggedBlocksWithSets = new Set(
    logged
      .filter((m) => m.set_count > 0)
      .map((m) => m.block.trim().toLowerCase())
      .filter((block) => block.length > 0)
  );

  for (const movement of movements) {
    if (omit.has(movement.id)) continue;

    if (movement.set_count > 0 && !loggedMovementIds.has(movement.id)) {
      omit.add(movement.id);
      continue;
    }

    const parts = splitComplexName(movement.name);
    if (movement.set_count > 0 && parts.length > 1) {
      const partNames = new Set(parts.map((part) => part.trim().toLowerCase()));
      const materialized = logged.some(
        (loggedMovement) =>
          loggedMovement.id !== movement.id &&
          partNames.has(loggedMovement.name.trim().toLowerCase())
      );
      if (materialized) {
        omit.add(movement.id);
        continue;
      }
    }

    const notes = movement.notes?.trim() ?? "";
    if (movement.set_count === 0 && notes) {
      const block = movement.block.trim().toLowerCase();
      if (block && loggedBlocksWithSets.has(block)) {
        omit.add(movement.id);
      }
    }
  }

  return movements.filter((m) => omit.has(m.id)).map((m) => m.id);
}

/**
 * Build MovementInsertInput rows for warmup drills expanded from notes
 * (or other on-the-day adds). Does not touch the DB — caller appends via
 * appendTemplateMovements.
 */
export function buildWarmupExpandInserts(
  drills: { name: string; dose: string }[],
  sortIndexStart: number,
  block = "Warmup"
): MovementInsertInput[] {
  return drills.map((drill, i) => ({
    sort_index: sortIndexStart + i,
    label: "W",
    name: drill.name,
    block,
    set_count: 1,
    targets: [drill.dose || ""],
    notes: "",
    from_pair: false,
    speed_journal_metric_key: null,
    speed_journal_component: null,
  }));
}

/**
 * Pair client temp movement ids with inserted UUIDs (same order).
 * Null/empty/whitespace temp ids are skipped.
 */
export function buildTempIdRemap(
  tempIds: (string | null | undefined)[],
  insertedIds: string[]
): Map<string, string> {
  const remap = new Map<string, string>();
  const len = Math.min(tempIds.length, insertedIds.length);
  for (let i = 0; i < len; i++) {
    const temp = tempIds[i];
    if (typeof temp !== "string") continue;
    const trimmed = temp.trim();
    if (!trimmed) continue;
    remap.set(trimmed, insertedIds[i]!);
  }
  return remap;
}

/**
 * Rewrite cell keys `movementId:setIndex` when movementId is in remap.
 * Keys without a colon, or whose movementId is not remapped, are left as-is.
 * Values are copied as-is (cell text or numeric RPE).
 */
export function remapCellKeys<T>(
  remap: Map<string, string>,
  cells: Record<string, T>
): Record<string, T> {
  if (remap.size === 0) return { ...cells };
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(cells)) {
    const colon = key.indexOf(":");
    if (colon <= 0) {
      out[key] = value;
      continue;
    }
    const movementId = key.slice(0, colon);
    const setIndex = key.slice(colon + 1);
    const realId = remap.get(movementId);
    out[realId != null ? `${realId}:${setIndex}` : key] = value;
  }
  return out;
}

export type ManualLogAthleteInput = {
  athleteId: string;
  cells: Record<string, string>;
  rpe_overrides?: Record<string, number | null>;
};

export type ManualLogBatchInput = {
  templateId: string;
  sessionDate: string;
  hugoGroup: string;
  movements: { id: string; set_count: number }[];
  defaults: Record<string, string>;
  athletes: ManualLogAthleteInput[];
};

export type ManualLogAthletePayload = {
  log: ConfirmLogPayload;
  results: ConfirmResultPayload[];
};

/**
 * Build confirm-compatible payloads for each athlete.
 * Absent cell keys inherit defaults; cleared ("") cells become raw_text null.
 */
export function buildManualLogAthletePayload(
  input: ManualLogBatchInput
): ManualLogAthletePayload[] {
  const batch: ManualLogAthletePayload[] = [];

  for (const athlete of input.athletes) {
    const editedCells: Record<string, string> = {};

    for (const movement of input.movements) {
      for (let setIndex = 0; setIndex < movement.set_count; setIndex++) {
        const key = cellKey(movement.id, setIndex);
        const defaultText = input.defaults[key] ?? "";
        const override =
          key in athlete.cells ? athlete.cells[key] : undefined;
        const resolved = resolveAthleteCell(defaultText, override);
        // Confirm expects "" for skip (raw_text null); default text when inheriting.
        editedCells[key] = resolved === null ? "" : resolved;
      }
    }

    const result = buildConfirmPayload({
      scan: {
        id: null,
        athlete_id: athlete.athleteId,
        template_id: input.templateId,
        extraction: { cells: {}, parsed: {}, warnings: [] },
      },
      template: {
        id: input.templateId,
        session_date: input.sessionDate,
        hugo_group: input.hugoGroup,
        movements: input.movements,
      },
      editedCells,
      rpeOverrides: athlete.rpe_overrides,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    batch.push({ log: result.log, results: result.results });
  }

  return batch;
}
