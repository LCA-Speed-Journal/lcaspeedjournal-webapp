import { describe, it, expect } from "vitest";
import { ZONE_LABELS } from "./palette";
import {
  cellsToGrid,
  emptyCutsGrid,
  gridToCells,
} from "./cuts-grid";

describe("emptyCutsGrid", () => {
  it("has an empty string for every palette row and both genders", () => {
    const grid = emptyCutsGrid();
    expect(Object.keys(grid)).toEqual([...ZONE_LABELS]);
    for (const label of ZONE_LABELS) {
      expect(grid[label]).toEqual({ M: "", F: "" });
    }
  });
});

describe("cellsToGrid", () => {
  it("writes filled cells into the matching row and gender as strings", () => {
    const grid = cellsToGrid([
      { gender: "F", label: "efficient", threshold: 20 },
      { gender: "M", label: "elite", threshold: 4.5 },
    ]);
    expect(grid.efficient.F).toBe("20");
    expect(grid.elite.M).toBe("4.5");
    expect(grid.poor.M).toBe("");
    expect(grid.poor.F).toBe("");
  });
});

describe("gridToCells", () => {
  it("omits empty strings so Save deletes those cells", () => {
    const grid = emptyCutsGrid();
    grid.efficient.F = "20";
    grid.elite.M = "4.5";
    const { cells, invalid } = gridToCells(grid);
    expect(invalid).toEqual([]);
    expect(cells).toEqual([
      { gender: "M", label: "elite", threshold: 4.5 },
      { gender: "F", label: "efficient", threshold: 20 },
    ]);
  });

  it("treats whitespace-only as empty", () => {
    const grid = emptyCutsGrid();
    grid.poor.M = "   ";
    const { cells, invalid } = gridToCells(grid);
    expect(cells).toEqual([]);
    expect(invalid).toEqual([]);
  });

  it("parses filled strings as numbers", () => {
    const grid = emptyCutsGrid();
    grid.advanced.M = "28";
    grid["world-class"].F = "0";
    const { cells } = gridToCells(grid);
    expect(cells).toEqual([
      { gender: "M", label: "advanced", threshold: 28 },
      { gender: "F", label: "world-class", threshold: 0 },
    ]);
  });

  it("flags invalid numbers instead of sending them", () => {
    const grid = emptyCutsGrid();
    grid.efficient.M = "abc";
    grid.elite.F = "4.5";
    const { cells, invalid } = gridToCells(grid);
    expect(cells).toEqual([{ gender: "F", label: "elite", threshold: 4.5 }]);
    expect(invalid).toEqual([{ gender: "M", label: "efficient", raw: "abc" }]);
  });
});
