import { describe, it, expect } from "vitest";
import { resolveCanonicalZeroStartRow } from "./canonical-cumulative";
import { getMetricsRegistry } from "./parser";

describe("resolveCanonicalZeroStartRow", () => {
  const reg = getMetricsRegistry() as import("./canonical-cumulative").MetricRegistry;

  it("maps 20m_Accel + endM 5 to 5m_Accel with null component (single_interval)", () => {
    expect(resolveCanonicalZeroStartRow("20m_Accel", 5, reg)).toEqual({
      metric_key: "5m_Accel",
      component: null,
    });
  });

  it("maps 20m_Accel + endM 10 to 10m_Accel with primary 0-10m", () => {
    expect(resolveCanonicalZeroStartRow("20m_Accel", 10, reg)).toEqual({
      metric_key: "10m_Accel",
      component: "0-10m",
    });
  });

  it("maps 30m_Accel + endM 30 to 30m_Accel with primary 0-30m", () => {
    expect(resolveCanonicalZeroStartRow("30m_Accel", 30, reg)).toEqual({
      metric_key: "30m_Accel",
      component: "0-30m",
    });
  });

  it("returns null when candidate missing (50m_Sprint + 30 — no 30m_Sprint)", () => {
    expect(resolveCanonicalZeroStartRow("50m_Sprint", 30, reg)).toBeNull();
  });

  it("returns null for non-matching parent (3x200m)", () => {
    expect(resolveCanonicalZeroStartRow("3x200m", 200, reg)).toBeNull();
  });
});
