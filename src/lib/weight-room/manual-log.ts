import { splitWarmupDrills } from "./split-warmup-drills";
import {
  buildConfirmPayload,
  cellKey,
  type ConfirmLogPayload,
  type ConfirmResultPayload,
} from "./confirm-scan";
import type { MovementInsertInput } from "./insert-template";

export type ManualLogGridRow = {
  source: "template" | "warmup_expand";
  movementId: string | null;
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

export type ManualLogAthleteInput = {
  athleteId: string;
  cells: Record<string, string>;
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
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    batch.push({ log: result.log, results: result.results });
  }

  return batch;
}
