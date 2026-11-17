import { describe, expect, it } from "vitest";
import { parseSpeedRunRaw } from "./raw-run";
import { rowsForSpeedRun } from "./save-rows";

const stored = JSON.stringify({
  distanceUnit: "m",
  untimedBuild: "0",
  gates: ["10", "20", "40"],
  cumulativeTimes: ["1.7", "2.85", "3.9"],
});

describe("parseSpeedRunRaw", () => {
  it("reads a stored speed run", () => {
    expect(parseSpeedRunRaw(stored)?.distanceUnit).toBe("m");
  });

  it("treats an m to yd edit as a new yard run", () => {
    const edited = stored.replace('"m"', '"yd"');
    const input = parseSpeedRunRaw(edited);
    expect(input).not.toBeNull();
    const rows = rowsForSpeedRun(input!);
    const forty = rows.find((row) => row.component === "0-40yd");
    expect(forty?.legacy_metric_key).toBe("40yd_Dash");
    expect(rows.some((row) => row.distance_unit === "m")).toBe(false);
  });

  it("returns null for a normal raw time", () => {
    expect(parseSpeedRunRaw("1.70|2.85|3.90")).toBeNull();
  });
});