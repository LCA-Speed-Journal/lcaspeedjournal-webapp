import { describe, it, expect } from "vitest";
import {
  cutsEditorMetrics,
  defaultCutsComponent,
  metricLabel,
  NORMS_DEFAULTS_METRIC_KEYS,
  TWENTY_YD_COMPONENTS,
  AGILITY_5105_CUT_COMPONENTS,
} from "./editor-metrics";

describe("NORMS_DEFAULTS_METRIC_KEYS", () => {
  it("includes 10-5_RSI with the existing intake tests", () => {
    expect(NORMS_DEFAULTS_METRIC_KEYS).toEqual([
      "Vertical Jump",
      "Standing-Broad",
      "10-5_RSI",
      "40yd_Dash",
      "20yd_Dash",
      "MaxVelocity",
      "5-10-5_Agility",
      "OH-MB_Throw",
      "UH-MB_Throw",
    ]);
  });
});

describe("defaultCutsComponent", () => {
  it("defaults 40yd_Dash to 0-40yd so named parsed rows can match cuts", () => {
    expect(defaultCutsComponent("40yd_Dash")).toBe("0-40yd");
  });

  it("defaults 20yd_Dash to 0-20yd", () => {
    expect(defaultCutsComponent("20yd_Dash")).toBe("0-20yd");
  });

  it("keeps 5-10-5 overall empty so Average and Athlete-Comfort share the sport cut", () => {
    expect(defaultCutsComponent("5-10-5_Agility")).toBe("");
  });

  it("keeps other metrics empty/none", () => {
    expect(defaultCutsComponent("Vertical Jump")).toBe("");
    expect(defaultCutsComponent("Standing-Broad")).toBe("");
    expect(defaultCutsComponent("OH-MB_Throw")).toBe("");
  });

  it("labels MaxVelocity and keeps its cuts component empty", () => {
    expect(metricLabel("MaxVelocity")).toBe("Max Velocity");
    expect(defaultCutsComponent("MaxVelocity")).toBe("");
    expect(cutsEditorMetrics().some((m) => m.key === "MaxVelocity")).toBe(true);
  });
});

describe("named cut components", () => {
  it("lists 20yd split windows", () => {
    expect(TWENTY_YD_COMPONENTS).toEqual([
      "0-5yd",
      "0-10yd",
      "0-20yd",
      "5-10yd",
      "10-20yd",
    ]);
  });

  it("lists 5-10-5 side extras (Overall is empty string, not in this list)", () => {
    expect(AGILITY_5105_CUT_COMPONENTS).toEqual(["L", "R"]);
  });
});
