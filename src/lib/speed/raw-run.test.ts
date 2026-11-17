import { describe, expect, it } from "vitest";
import {
  decideSpeedRunRawPatch,
  entryIsSpeedRunRow,
  parseSpeedRunRaw,
  shouldRebuildSpeedRun,
} from "./raw-run";
import { rowsForSpeedRun } from "./save-rows";
import { ACCELERATION_KEY } from "./windows";

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

describe("decideSpeedRunRawPatch", () => {
  it("falls through when a registry metric row gets speed-shaped JSON", () => {
    const decision = decideSpeedRunRawPatch("36.5", "StandingVertical", stored);
    expect(decision.kind).toBe("parseEntry");
    expect(shouldRebuildSpeedRun("36.5", "StandingVertical", stored)).toBe(false);
  });

  it("rebuilds when the stored row is already a speed run", () => {
    const edited = stored.replace('"m"', '"yd"');
    expect(entryIsSpeedRunRow(stored, ACCELERATION_KEY)).toBe(true);
    const decision = decideSpeedRunRawPatch(stored, ACCELERATION_KEY, edited);
    expect(decision.kind).toBe("rebuild");
    if (decision.kind === "rebuild") {
      expect(decision.input.distanceUnit).toBe("yd");
    }
  });

  it("rejects rebuild when stored raw_input is blank", () => {
    const decision = decideSpeedRunRawPatch("  ", ACCELERATION_KEY, stored);
    expect(decision.kind).toBe("error");
    if (decision.kind === "error") {
      expect(decision.message).toMatch(/no saved speed-run JSON/i);
    }
  });

  it("rejects non-JSON edits on a speed run row", () => {
    const decision = decideSpeedRunRawPatch(stored, ACCELERATION_KEY, "1.70|2.85");
    expect(decision.kind).toBe("error");
  });
});