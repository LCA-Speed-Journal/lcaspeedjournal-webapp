import { describe, expect, it } from "vitest";
import { getHistoricalComponentFilter } from "./historical-metric-filter";

describe("getHistoricalComponentFilter", () => {
  it("returns null primary for non-cumulative metric", () => {
    const out = getHistoricalComponentFilter("5m_Accel");
    expect(out).toEqual({ primary: null, allowNullComponent: false });
  });

  it("returns primary + null-compatible flag for cumulative metric", () => {
    const out = getHistoricalComponentFilter("20m_Accel");
    expect(out).toEqual({ primary: "0-20m", allowNullComponent: true });
  });

  it("returns no primary filter for single_interval metrics", () => {
    expect(getHistoricalComponentFilter("Broad_Jump")).toEqual({
      primary: null,
      allowNullComponent: false,
    });
  });

  it("does not apply cumulative primary filter to flying split metrics", () => {
    expect(getHistoricalComponentFilter("20-40m_Split")).toEqual({
      primary: null,
      allowNullComponent: false,
    });
    expect(getHistoricalComponentFilter("30-50m_Split")).toEqual({
      primary: null,
      allowNullComponent: false,
    });
    expect(getHistoricalComponentFilter("40-60m_Split")).toEqual({
      primary: null,
      allowNullComponent: false,
    });
  });
});
