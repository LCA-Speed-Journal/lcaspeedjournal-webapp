import { ZONE_LABELS, isZoneLabel, type ZoneLabel } from "./palette";
import type { ThresholdCell } from "./editor";

export type CutsGrid = Record<ZoneLabel, { M: string; F: string }>;

export type InvalidCutCell = {
  gender: "M" | "F";
  label: ZoneLabel;
  raw: string;
};

const GENDERS = ["M", "F"] as const;

export function emptyCutsGrid(): CutsGrid {
  const grid = {} as CutsGrid;
  for (const label of ZONE_LABELS) {
    grid[label] = { M: "", F: "" };
  }
  return grid;
}

export function cellsToGrid(
  cells: Array<{ gender: "M" | "F"; label: string; threshold: number }>
): CutsGrid {
  const grid = emptyCutsGrid();
  for (const cell of cells) {
    if (!isZoneLabel(cell.label)) continue;
    if (cell.gender !== "M" && cell.gender !== "F") continue;
    if (!Number.isFinite(cell.threshold)) continue;
    grid[cell.label][cell.gender] = String(cell.threshold);
  }
  return grid;
}

export function gridToCells(grid: CutsGrid): {
  cells: ThresholdCell[];
  invalid: InvalidCutCell[];
} {
  const cells: ThresholdCell[] = [];
  const invalid: InvalidCutCell[] = [];

  for (const gender of GENDERS) {
    for (const label of ZONE_LABELS) {
      const raw = grid[label][gender];
      const trimmed = raw.trim();
      if (trimmed === "") continue;
      const threshold = Number(trimmed);
      if (!Number.isFinite(threshold)) {
        invalid.push({ gender, label, raw });
        continue;
      }
      cells.push({ gender, label, threshold });
    }
  }

  return { cells, invalid };
}
