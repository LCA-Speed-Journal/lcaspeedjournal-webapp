import { describe, it, expect } from "vitest";
import { getPrimaryComponent, formatEntryMetricLabel } from "./metric-utils";

describe("getPrimaryComponent", () => {
  it("returns 0-20m for 20m_Accel (cumulative, default_splits [5,5,10])", () => {
    expect(getPrimaryComponent("20m_Accel")).toBe("0-20m");
  });

  it("returns 0-10m for 10m_Accel (cumulative, default_splits [5,5])", () => {
    expect(getPrimaryComponent("10m_Accel")).toBe("0-10m");
  });

  it("returns null for 5m_Accel (single_interval)", () => {
    expect(getPrimaryComponent("5m_Accel")).toBeNull();
  });

  it("returns null for unknown metric", () => {
    expect(getPrimaryComponent("Unknown_Metric")).toBeNull();
  });

  it("returns 0-40m for 40m_Sprint (cumulative)", () => {
    expect(getPrimaryComponent("40m_Sprint")).toBe("0-40m");
  });

  it("returns null when default_splits has no numbers", () => {
    expect(getPrimaryComponent("5m_Accel")).toBeNull();
  });
});

describe("formatEntryMetricLabel", () => {
  it("returns metric_key when component is null", () => {
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: null })).toBe("20m_Accel");
  });

  it("returns metric_key when component is empty string", () => {
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: "" })).toBe("20m_Accel");
  });

  it("returns composite label when component is set", () => {
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: "0-5m" })).toBe("20m_Accel (0-5m)");
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: "5-10m" })).toBe("20m_Accel (5-10m)");
  });

  it("handles unknown metric with component", () => {
    expect(formatEntryMetricLabel({ metric_key: "Unknown", component: "0-5m" })).toBe("Unknown (0-5m)");
  });
});
