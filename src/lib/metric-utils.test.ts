import { describe, it, expect } from "vitest";
import {
  getPrimaryComponent,
  formatEntryMetricLabel,
  isPrimaryResultComponent,
  isLiveOverallEntry,
  sessionHasOverallChip,
} from "./metric-utils";

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

  it("returns 0-40yd for 40yd_Dash", () => {
    expect(getPrimaryComponent("40yd_Dash")).toBe("0-40yd");
  });

  it("returns 0-20yd for 20yd_Dash", () => {
    expect(getPrimaryComponent("20yd_Dash")).toBe("0-20yd");
  });

  it("returns null when default_splits has no numbers", () => {
    expect(getPrimaryComponent("5m_Accel")).toBeNull();
  });

  it("returns null for new flying 20m split metrics (single_interval)", () => {
    expect(getPrimaryComponent("20-40m_Split")).toBeNull();
    expect(getPrimaryComponent("30-50m_Split")).toBeNull();
    expect(getPrimaryComponent("40-60m_Split")).toBeNull();
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

describe("isPrimaryResultComponent", () => {
  it("treats Average and Athlete-Comfort as 5-10-5 overall", () => {
    expect(isPrimaryResultComponent("5-10-5_Agility", "Average")).toBe(true);
    expect(isPrimaryResultComponent("5-10-5_Agility", "Athlete-Comfort")).toBe(true);
    expect(isPrimaryResultComponent("5-10-5_Agility", "L")).toBe(false);
    expect(isPrimaryResultComponent("5-10-5_Agility", "R")).toBe(false);
    expect(isPrimaryResultComponent("5-10-5_Agility", null)).toBe(false);
  });

  it("uses the cumulative full-run component", () => {
    expect(isPrimaryResultComponent("20yd_Dash", "0-20yd")).toBe(true);
    expect(isPrimaryResultComponent("20yd_Dash", "0-10yd")).toBe(false);
    expect(isPrimaryResultComponent("40yd_Dash", "0-40yd")).toBe(true);
    expect(isPrimaryResultComponent("20m_Accel", "0-20m")).toBe(true);
  });

  it("treats empty component as overall for single-interval metrics", () => {
    expect(isPrimaryResultComponent("Vertical Jump", null)).toBe(true);
    expect(isPrimaryResultComponent("Vertical Jump", "")).toBe(true);
  });

  it("keeps ISO paired L/R rows when there is no cumulative primary", () => {
    expect(isPrimaryResultComponent("ISO-Force_Ham-Curl", "L")).toBe(true);
    expect(isPrimaryResultComponent("ISO-Force_Ham-Curl", "R")).toBe(true);
    expect(isPrimaryResultComponent("5-10-5_Agility", "L")).toBe(false);
    expect(isPrimaryResultComponent("5-10-5_Agility", "Average")).toBe(true);
    expect(isPrimaryResultComponent("Vertical Jump", null)).toBe(true);
  });
});

describe("liveOverallEntry", () => {
  it("treats 5-10-5 Average and Athlete-Comfort as overall", () => {
    expect(isLiveOverallEntry("5-10-5_Agility", null, "Average")).toBe(true);
    expect(isLiveOverallEntry("5-10-5_Agility", null, "Athlete-Comfort")).toBe(true);
    expect(isLiveOverallEntry("5-10-5_Agility", null, "L")).toBe(false);
    expect(isLiveOverallEntry("5-10-5_Agility", 0, "Average")).toBe(false);
  });

  it("treats null-component rows as overall for other metrics", () => {
    expect(isLiveOverallEntry("Vertical Jump", null, null)).toBe(true);
    expect(isLiveOverallEntry("Vertical Jump", null, "x")).toBe(false);
  });
});

describe("sessionHasOverallChip", () => {
  it("adds Overall when 5-10-5 has a primary side", () => {
    expect(
      sessionHasOverallChip("5-10-5_Agility", [
        { interval_index: null, component: "Athlete-Comfort" },
      ])
    ).toBe(true);
  });

  it("does not invent Overall for 40yd named splits", () => {
    expect(
      sessionHasOverallChip("40yd_Dash", [
        { interval_index: 2, component: "0-40yd" },
      ])
    ).toBe(false);
  });
});
