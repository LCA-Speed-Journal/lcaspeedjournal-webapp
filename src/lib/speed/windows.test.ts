import { describe, expect, it } from "vitest";
import {
  aliasForWindow,
  classifyLegacySpeedRow,
  expandSpeedRun,
  isShortPracticeWindow,
  mphForWindow,
  sameSpeedMark,
  timeFromMph,
} from "./windows";

describe("expandSpeedRun", () => {
  it("writes every pair from a 40yd with gates at 10, 20, and 40", () => {
    const rows = expandSpeedRun({
      distanceUnit: "yd",
      untimedBuild: 0,
      gates: [10, 20, 40],
      cumulativeTimes: [1.7, 2.9, 4.8],
    });
    expect(rows.map((row) => [row.metric_key, row.component, row.units])).toEqual([
      ["Acceleration", "0-10yd", "s"],
      ["Acceleration", "0-20yd", "s"],
      ["Acceleration", "0-40yd", "s"],
      ["BuildIn", "10-20yd", "mph"],
      ["BuildIn", "10-40yd", "mph"],
      ["BuildIn", "20-40yd", "mph"],
    ]);
    const fly = rows.find((row) => row.component === "10-20yd")!;
    expect(fly.value).toBeCloseTo(1.2);
    expect(fly.start_distance).toBe(10);
    expect(fly.end_distance).toBe(20);
    expect(fly.display_value).toBeCloseTo(mphForWindow(10, "yd", 1.2));
  });

  it("stores a 5-15 as one fly and no acceleration", () => {
    const rows = expandSpeedRun({
      distanceUnit: "yd",
      untimedBuild: 5,
      gates: [15],
      cumulativeTimes: [1.05],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric_key: "BuildIn",
      component: "5-15yd",
      distance_unit: "yd",
      start_distance: 5,
      end_distance: 15,
      value: 1.05,
      units: "mph",
    });
  });

  it("rejects a gate that is not past the build", () => {
    expect(() =>
      expandSpeedRun({
        distanceUnit: "m",
        untimedBuild: 10,
        gates: [10],
        cumulativeTimes: [1],
      })
    ).toThrow(/past the build/);
  });
});

describe("classifyLegacySpeedRow", () => {
  it("maps a named acceleration and a meter split", () => {
    expect(classifyLegacySpeedRow({ metric_key: "10m_Accel", component: null })).toMatchObject({
      metric_key: "Acceleration",
      distance_unit: "m",
      start_distance: 0,
      end_distance: 10,
    });
    expect(classifyLegacySpeedRow({ metric_key: "5-15m_Split", component: "5-15m" })).toMatchObject({
      metric_key: "BuildIn",
      distance_unit: "m",
      start_distance: 5,
      end_distance: 15,
    });
  });

  it("maps a 40yd component and ignores a sled", () => {
    expect(classifyLegacySpeedRow({ metric_key: "40yd_Dash", component: "20-40yd" })).toMatchObject({
      metric_key: "BuildIn",
      distance_unit: "yd",
      start_distance: 20,
      end_distance: 40,
    });
    expect(classifyLegacySpeedRow({ metric_key: "10m_Light-Sled", component: null })).toBeNull();
    expect(classifyLegacySpeedRow({ metric_key: "MaxVelocity", component: null })).toBeNull();
  });
});

describe("mph helpers", () => {
  it("turns 10 yards in 1 second into about 20.45 mph", () => {
    expect(mphForWindow(10, "yd", 1)).toBeCloseTo(20.455, 2);
  });

  it("recovers the time from that mph", () => {
    const mph = mphForWindow(10, "yd", 1.2);
    expect(timeFromMph(10, "yd", mph)).toBeCloseTo(1.2, 5);
  });
});

describe("isShortPracticeWindow", () => {
  it("includes the short accelerations and the 10-into-20 fly in both units", () => {
    expect(isShortPracticeWindow({ distance_unit: "yd", start_distance: 0, end_distance: 10 })).toBe(true);
    expect(isShortPracticeWindow({ distance_unit: "m", start_distance: 10, end_distance: 20 })).toBe(true);
    expect(isShortPracticeWindow({ distance_unit: "yd", start_distance: 0, end_distance: 40 })).toBe(false);
    expect(isShortPracticeWindow({ distance_unit: "yd", start_distance: 5, end_distance: 15 })).toBe(false);
    expect(isShortPracticeWindow({ distance_unit: "m", start_distance: 20, end_distance: 40 })).toBe(false);
  });
});

describe("aliasForWindow", () => {
  it("names the full 40 and a 10m accel", () => {
    expect(
      aliasForWindow({ distance_unit: "yd", start_distance: 0, end_distance: 40 })
    ).toEqual({ legacy_metric_key: "40yd_Dash", legacy_component: "0-40yd" });
    expect(
      aliasForWindow({ distance_unit: "m", start_distance: 0, end_distance: 10 })
    ).toEqual({ legacy_metric_key: "10m_Accel", legacy_component: "0-10m" });
    expect(
      aliasForWindow({ distance_unit: "m", start_distance: 10, end_distance: 20 })
    ).toEqual({ legacy_metric_key: "10-20m_Split", legacy_component: "10-20m" });
    expect(
      aliasForWindow({ distance_unit: "yd", start_distance: 17, end_distance: 33 })
    ).toBeNull();
  });
});

describe("sameSpeedMark", () => {
  it("matches a rewritten row by its legacy fields", () => {
    expect(
      sameSpeedMark(
        {
          metric_key: "Acceleration",
          component: "0-40yd",
          legacy_metric_key: "40yd_Dash",
          legacy_component: "0-40yd",
        },
        "40yd_Dash",
        "0-40yd"
      )
    ).toBe(true);
  });

  it("still matches a row that has not been migrated", () => {
    expect(
      sameSpeedMark(
        { metric_key: "40yd_Dash", component: "0-40yd", legacy_metric_key: null, legacy_component: null },
        "40yd_Dash",
        "0-40yd"
      )
    ).toBe(true);
  });
});
