import { parseLoadReps } from "./parse-load-reps";
import { isHugoGroup, type HugoGroup } from "./constants";
import type { ParsedLoadReps } from "@/types/weight-room";

export function cellKey(movementId: string, setIndex: number): string {
  return `${movementId}:${setIndex}`;
}

export type ConfirmScanInput = {
  scan: {
    id?: string | null;
    athlete_id: string | null;
    template_id: string | null;
    extraction?: unknown;
    status?: string;
  };
  template: {
    id: string;
    session_date: string;
    hugo_group: string;
    movements: { id: string; set_count: number }[];
  };
  editedCells: Record<string, string>;
};

export type ConfirmLogPayload = {
  athlete_id: string;
  template_id: string;
  scan_id: string | null;
  session_date: string;
  hugo_group: HugoGroup;
};

export type ConfirmResultPayload = {
  movement_id: string;
  set_index: number;
  raw_text: string | null;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
  corrected: boolean;
};

export type ConfirmPayloadOk = {
  ok: true;
  log: ConfirmLogPayload;
  results: ConfirmResultPayload[];
};

export type ConfirmPayloadErr = {
  ok: false;
  error: string;
};

export type ConfirmPayloadResult = ConfirmPayloadOk | ConfirmPayloadErr;

export type ScanExtraction = {
  cells: Record<string, string>;
  parsed: Record<string, ParsedLoadReps>;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      out[key] = raw;
    }
  }
  return out;
}

/** Normalize card_scans.extraction JSON (object or string) into cells + parsed. */
export function parseScanExtraction(raw: unknown): ScanExtraction {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return { cells: {}, parsed: {}, warnings: [] };
    }
  }
  if (!isRecord(obj)) {
    return { cells: {}, parsed: {}, warnings: [] };
  }
  const cells = asStringMap(obj.cells);
  const parsed: Record<string, ParsedLoadReps> = {};
  if (isRecord(obj.parsed)) {
    for (const [key, value] of Object.entries(obj.parsed)) {
      if (isRecord(value) && typeof value.raw === "string") {
        parsed[key] = parseLoadReps(value.raw);
      }
    }
  }
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string")
    : [];
  return { cells, parsed, warnings };
}

export function mergeExtractionCells(
  current: unknown,
  cells: Record<string, string>
): ScanExtraction {
  const existing = parseScanExtraction(current);
  const nextCells = { ...existing.cells, ...cells };
  const parsed: Record<string, ParsedLoadReps> = {};
  for (const [key, raw] of Object.entries(nextCells)) {
    parsed[key] = parseLoadReps(raw);
  }
  return {
    cells: nextCells,
    parsed,
    warnings: existing.warnings,
  };
}

export function buildConfirmPayload(input: ConfirmScanInput): ConfirmPayloadResult {
  const athleteId =
    typeof input.scan.athlete_id === "string" ? input.scan.athlete_id.trim() : "";
  if (!athleteId) {
    return { ok: false, error: "athlete_id is required" };
  }

  const templateId =
    typeof input.scan.template_id === "string" ? input.scan.template_id.trim() : "";
  if (!templateId) {
    return { ok: false, error: "template_id is required" };
  }

  if (!isHugoGroup(input.template.hugo_group)) {
    return { ok: false, error: "template hugo_group is invalid" };
  }

  const original = parseScanExtraction(input.scan.extraction).cells;
  const results: ConfirmResultPayload[] = [];

  for (const movement of input.template.movements) {
    for (let setIndex = 0; setIndex < movement.set_count; setIndex++) {
      const key = cellKey(movement.id, setIndex);
      const originalRaw = original[key] ?? "";
      const editedRaw =
        key in input.editedCells ? input.editedCells[key] : originalRaw;
      const editedTrim = editedRaw.trim();
      const parsed = parseLoadReps(editedRaw);
      results.push({
        movement_id: movement.id,
        set_index: setIndex,
        raw_text: editedTrim === "" ? null : editedTrim,
        kind: parsed.kind,
        load: parsed.load,
        reps: parsed.reps,
        units: parsed.units,
        corrected: editedTrim !== originalRaw.trim(),
      });
    }
  }

  return {
    ok: true,
    log: {
      athlete_id: athleteId,
      template_id: templateId,
      scan_id: input.scan.id ?? null,
      session_date: input.template.session_date,
      hugo_group: input.template.hugo_group,
    },
    results,
  };
}
