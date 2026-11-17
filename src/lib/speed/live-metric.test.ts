import { describe, expect, it } from "vitest";
import { liveMetricDef, leaderboardErrorMessage } from "./live-metric";

describe("liveMetricDef", () => {
  const registry = {
    DRI: { display_name: "DRI", display_units: "DRI" },
  };

  it("ranks acceleration in seconds and build-in in mph", () => {
    expect(liveMetricDef("Acceleration", registry)).toEqual({
      display_name: "Acceleration",
      display_units: "s",
    });
    expect(liveMetricDef("BuildIn", registry)).toEqual({
      display_name: "BuildIn",
      display_units: "mph",
    });
  });

  it("keeps registry metrics and rejects unknown ones", () => {
    expect(liveMetricDef("DRI", registry)?.display_name).toBe("DRI");
    expect(liveMetricDef("NotATest", registry)).toBeNull();
  });
});

describe("leaderboardErrorMessage", () => {
  it("prefers the API error sentence", () => {
    expect(leaderboardErrorMessage({ error: "Unknown metric: Acceleration" }, "Bad Request")).toBe(
      "Unknown metric: Acceleration"
    );
  });
});