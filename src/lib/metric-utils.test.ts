import { describe, it, expect } from "vitest";
import { getPrimaryComponent } from "./metric-utils";

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
