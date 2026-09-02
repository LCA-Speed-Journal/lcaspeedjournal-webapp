import { describe, expect, it } from "vitest";
import { getHistoricalComponentFilter } from "./historical-metric-filter";

describe("getHistoricalComponentFilter", () => {
  it("returns null primary for non-cumulative metric", () => {
    const out = getHistoricalComponentFilter("5m_Accel");
    expect(out).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: null,
    });
  });

  it("returns primary + null-compatible flag for cumulative metric", () => {
    const out = getHistoricalComponentFilter("20m_Accel");
    expect(out).toEqual({
      primary: "0-20m",
      allowNullComponent: true,
      allowedComponents: null,
    });
  });

  it("returns no primary filter for single_interval metrics", () => {
    expect(getHistoricalComponentFilter("Broad_Jump")).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: null,
    });
  });

  it("does not apply cumulative primary filter to flying split metrics", () => {
    expect(getHistoricalComponentFilter("20-40m_Split")).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: null,
    });
    expect(getHistoricalComponentFilter("30-50m_Split")).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: null,
    });
    expect(getHistoricalComponentFilter("40-60m_Split")).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: null,
    });
  });

  it("returns 0-20yd primary for 20yd_Dash", () => {
    expect(getHistoricalComponentFilter("20yd_Dash")).toEqual({
      primary: "0-20yd",
      allowNullComponent: true,
      allowedComponents: null,
    });
  });

  it("restricts 5-10-5 to Average and Athlete-Comfort", () => {
    expect(getHistoricalComponentFilter("5-10-5_Agility")).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: ["Average", "Athlete-Comfort"],
    });
  });
});
