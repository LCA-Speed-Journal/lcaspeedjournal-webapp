import { getMetricsRegistry } from "@/lib/parser";
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";
import { isZoneLabel, type ZoneLabel } from "./palette";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditorOk<T> = { ok: true; value: T };
export type EditorErr = { ok: false; error: string };
export type EditorResult<T> = EditorOk<T> | EditorErr;

export type ThresholdCell = {
  gender: "M" | "F";
  label: ZoneLabel;
  threshold: number;
};

export type ThresholdSlice = {
  population_id: string;
  metric_key: string;
  component: string | null;
  cells: ThresholdCell[];
};

export type PopulationCreate = {
  name: string;
  notes: string | null;
};

export type PopulationPatch = {
  name?: string;
  notes?: string | null;
  archived?: boolean;
};

export type SportDefaultPut = {
  hugo_group: HugoGroup;
  metric_key: string;
  population_id: string | null;
};

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function isKnownMetricKey(value: unknown): value is string {
  return typeof value === "string" && value in getMetricsRegistry();
}

export function normalizeComponent(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function uniqueCutsPerGender(
  cells: ThresholdCell[]
): { ok: true } | { ok: false; error: string } {
  const labelsByGender: Record<"M" | "F", Set<string>> = {
    M: new Set(),
    F: new Set(),
  };
  const cutsByGender: Record<"M" | "F", Set<number>> = {
    M: new Set(),
    F: new Set(),
  };

  for (const cell of cells) {
    if (labelsByGender[cell.gender].has(cell.label)) {
      return {
        ok: false,
        error: `Duplicate label "${cell.label}" for gender ${cell.gender}`,
      };
    }
    labelsByGender[cell.gender].add(cell.label);

    if (cutsByGender[cell.gender].has(cell.threshold)) {
      return {
        ok: false,
        error: `Threshold values must be unique per gender (duplicate ${cell.threshold} for ${cell.gender})`,
      };
    }
    cutsByGender[cell.gender].add(cell.threshold);
  }

  return { ok: true };
}

export function parseThresholdCells(
  input: unknown
): EditorResult<ThresholdCell[]> {
  if (!Array.isArray(input)) {
    return { ok: false, error: "cells must be an array" };
  }

  const cells: ThresholdCell[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: `cells[${i}] is invalid` };
    }
    const rec = raw as Record<string, unknown>;
    if (rec.gender !== "M" && rec.gender !== "F") {
      return { ok: false, error: `cells[${i}].gender must be M or F` };
    }
    if (!isZoneLabel(rec.label)) {
      return { ok: false, error: `cells[${i}].label is not a valid zone label` };
    }
    const threshold = parseFiniteNumber(rec.threshold);
    if (threshold == null) {
      return { ok: false, error: `cells[${i}].threshold must be a finite number` };
    }
    cells.push({ gender: rec.gender, label: rec.label, threshold });
  }

  const unique = uniqueCutsPerGender(cells);
  if (!unique.ok) return unique;

  return { ok: true, value: cells };
}

function parseRequiredUuid(
  value: unknown,
  field: string
): EditorResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: `Missing ${field}` };
  }
  if (!isUuidString(value)) {
    return { ok: false, error: `Invalid ${field}` };
  }
  return { ok: true, value: value.trim() };
}

export function parseThresholdSliceReplace(input: {
  population_id?: unknown;
  metric_key?: unknown;
  component?: unknown;
  cells?: unknown;
}): EditorResult<ThresholdSlice> {
  const pop = parseRequiredUuid(input.population_id, "population_id");
  if (!pop.ok) return pop;

  if (!isKnownMetricKey(input.metric_key)) {
    return { ok: false, error: `Unknown metric: ${String(input.metric_key ?? "")}` };
  }

  const cells = parseThresholdCells(input.cells ?? []);
  if (!cells.ok) return cells;

  return {
    ok: true,
    value: {
      population_id: pop.value,
      metric_key: input.metric_key,
      component: normalizeComponent(input.component),
      cells: cells.value,
    },
  };
}

export function assertCanArchivePopulation(
  referencingDefaultCount: number
): { ok: true } | { ok: false; error: string; status: 409 } {
  if (referencingDefaultCount > 0) {
    return {
      ok: false,
      status: 409,
      error: "Cannot archive a population that is still used as a sport default",
    };
  }
  return { ok: true };
}

export function parsePopulationCreateBody(
  body: unknown
): EditorResult<PopulationCreate> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const rec = body as Record<string, unknown>;
  if (typeof rec.name !== "string" || !rec.name.trim()) {
    return { ok: false, error: "Missing or invalid name" };
  }
  let notes: string | null = null;
  if (rec.notes != null) {
    if (typeof rec.notes !== "string") {
      return { ok: false, error: "Invalid notes" };
    }
    const trimmed = rec.notes.trim();
    notes = trimmed === "" ? null : trimmed;
  }
  return { ok: true, value: { name: rec.name.trim(), notes } };
}

export function parsePopulationPatchBody(
  body: unknown
): EditorResult<PopulationPatch> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const rec = body as Record<string, unknown>;
  const patch: PopulationPatch = {};

  if ("name" in rec) {
    if (typeof rec.name !== "string" || !rec.name.trim()) {
      return { ok: false, error: "Invalid name" };
    }
    patch.name = rec.name.trim();
  }

  if ("notes" in rec) {
    if (rec.notes == null) {
      patch.notes = null;
    } else if (typeof rec.notes === "string") {
      const trimmed = rec.notes.trim();
      patch.notes = trimmed === "" ? null : trimmed;
    } else {
      return { ok: false, error: "Invalid notes" };
    }
  }

  if ("archived" in rec) {
    if (typeof rec.archived !== "boolean") {
      return { ok: false, error: "archived must be a boolean" };
    }
    patch.archived = rec.archived;
  }

  if (patch.name === undefined && patch.notes === undefined && patch.archived === undefined) {
    return { ok: false, error: "Provide name, notes, and/or archived" };
  }

  return { ok: true, value: patch };
}

export function parseSportDefaultPut(body: unknown): EditorResult<SportDefaultPut> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const rec = body as Record<string, unknown>;

  if (!isHugoGroup(rec.hugo_group)) {
    return { ok: false, error: "Invalid hugo_group" };
  }

  if (!isKnownMetricKey(rec.metric_key)) {
    return { ok: false, error: `Unknown metric: ${String(rec.metric_key ?? "")}` };
  }

  if (rec.population_id == null) {
    return {
      ok: true,
      value: {
        hugo_group: rec.hugo_group,
        metric_key: rec.metric_key,
        population_id: null,
      },
    };
  }

  const pop = parseRequiredUuid(rec.population_id, "population_id");
  if (!pop.ok) return pop;

  return {
    ok: true,
    value: {
      hugo_group: rec.hugo_group,
      metric_key: rec.metric_key,
      population_id: pop.value,
    },
  };
}

export function parseThresholdSliceQuery(searchParams: URLSearchParams): EditorResult<{
  population_id: string;
  metric_key: string;
  component: string | null;
}> {
  const pop = parseRequiredUuid(searchParams.get("population_id"), "population_id");
  if (!pop.ok) return pop;

  const metric_key = searchParams.get("metric_key");
  if (!isKnownMetricKey(metric_key)) {
    return { ok: false, error: `Unknown metric: ${String(metric_key ?? "")}` };
  }

  return {
    ok: true,
    value: {
      population_id: pop.value,
      metric_key,
      component: normalizeComponent(searchParams.get("component")),
    },
  };
}
