import { describe, expect, it } from "vitest";
import { rowsForSpeedRun } from "./save-rows";

describe("rowsForSpeedRun", () => {
  it("attaches the legacy alias onto each window", () => {
    const rows = rowsForSpeedRun({
      distanceUnit: "m",
      untimedBuild: 0,
      gates: [10],
      cumulativeTimes: [1.7],
    });
    expect(rows[0]).toMatchObject({
      metric_key: "Acceleration",
      legacy_metric_key: "10m_Accel",
      legacy_component: "0-10m",
      distance_unit: "m",
      start_distance: 0,
      end_distance: 10,
    });
  });

  it("leaves the legacy alias null for a custom gate", () => {
    const rows = rowsForSpeedRun({
      distanceUnit: "yd",
      untimedBuild: 0,
      gates: [17, 33],
      cumulativeTimes: [2.4, 4.1],
    });
    const custom = rows.find((row) => row.start_distance === 17 && row.end_distance === 33);
    expect(custom?.legacy_metric_key).toBeNull();
    expect(custom?.legacy_component).toBeNull();
  });
});
