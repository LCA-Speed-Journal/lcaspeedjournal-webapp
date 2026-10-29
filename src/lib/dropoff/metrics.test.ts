import { describe, expect, it } from "vitest";
import { isDropoffMetric, isDropoffWindow } from "./metrics";

describe("isDropoffMetric", () => {
  it("includes short accel, sleds, the 10m fly, standing vertical, and broad", () => {
    for (const key of [
      "5m_Accel",
      "10m_Accel",
      "15m_Accel",
      "20m_Accel",
      "10m_Light-Sled",
      "10m_Medium-Sled",
      "20m_Light-Sled",
      "20m_Medium-Sled",
      "10-20m_Split",
      "Vertical Jump",
      "Standing-Broad",
    ]) {
      expect(isDropoffMetric(key)).toBe(true);
    }
  });

  it("excludes race-model, testing, and depth metrics", () => {
    for (const key of [
      "30m_Accel",
      "40yd_Dash",
      "24/28s_Drill",
      "3x200m",
      "Depth-Vertical_18",
      "MaxVelocity",
      "Paused-Vertical",
    ]) {
      expect(isDropoffMetric(key)).toBe(false);
    }
  });
});

it("treats a 10yd acceleration and a 10-20yd fly as practice marks", () => {
  expect(isDropoffWindow({ distance_unit: "yd", start_distance: 0, end_distance: 10 })).toBe(true);
  expect(isDropoffWindow({ distance_unit: "yd", start_distance: 10, end_distance: 20 })).toBe(true);
  expect(isDropoffWindow({ distance_unit: "yd", start_distance: 0, end_distance: 40 })).toBe(false);
  expect(isDropoffWindow({ distance_unit: "m", start_distance: 5, end_distance: 15 })).toBe(false);
});
