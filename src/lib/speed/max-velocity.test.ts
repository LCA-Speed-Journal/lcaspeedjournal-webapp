import { describe, expect, it } from "vitest";
import { bestBuildIn } from "./max-velocity";

describe("bestBuildIn", () => {
  it("picks the highest mph and keeps that window, ignoring a sled", () => {
    const best = bestBuildIn([
      { metric_key: "BuildIn", component: "10-20yd", display_value: 19 },
      { metric_key: "BuildIn", component: "20-40yd", display_value: 22.4 },
      { metric_key: "10-20m_Light-Sled", component: null, display_value: 30 },
      { metric_key: "Acceleration", component: "0-10yd", display_value: 1.6 },
    ]);
    expect(best).toEqual({ display_value: 22.4, component: "20-40yd" });
  });

  it("returns null when there is no build-in", () => {
    expect(bestBuildIn([])).toBeNull();
  });
});
