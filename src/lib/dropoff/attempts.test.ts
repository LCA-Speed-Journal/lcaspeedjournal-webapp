import { describe, expect, it } from "vitest";
import { isOverallDropoffView, overallAttemptsFor, type DropoffEntry } from "./attempts";

const base: DropoffEntry = {
  id: "b",
  athlete_id: "a1",
  metric_key: "10m_Accel",
  interval_index: null,
  component: null,
  display_value: 1.8,
  units: "s",
  created_at: "2026-10-28T15:00:00.000Z",
};

describe("overallAttemptsFor", () => {
  it("returns overall rows for one athlete and metric in entry order", () => {
    const entries: DropoffEntry[] = [
      { ...base, id: "late", display_value: "1.90", created_at: "2026-10-28T15:02:00.000Z" },
      { ...base, id: "early", display_value: 1.7, created_at: "2026-10-28T15:01:00.000Z" },
      { ...base, id: "other", athlete_id: "a2", display_value: 1.6 },
      { ...base, id: "split", component: "0-5m", display_value: 0.9 },
      { ...base, id: "jump", metric_key: "Vertical Jump", units: "in", display_value: 28 },
    ];
    expect(overallAttemptsFor(entries, "a1", "10m_Accel")).toEqual({
      units: "s",
      values: [1.7, 1.9],
    });
  });

  it("returns null when that athlete has no overall mark", () => {
    expect(overallAttemptsFor([base], "missing", "10m_Accel")).toBeNull();
  });

  it("includes the cumulative full-run component in entry order", () => {
    const entries: DropoffEntry[] = [
      {
        ...base,
        id: "late",
        component: "0-10m",
        display_value: "1.90",
        created_at: "2026-10-28T15:02:00.000Z",
      },
      {
        ...base,
        id: "early",
        component: "0-10m",
        display_value: 1.7,
        created_at: "2026-10-28T15:01:00.000Z",
      },
    ];
    expect(overallAttemptsFor(entries, "a1", "10m_Accel")).toEqual({
      units: "s",
      values: [1.7, 1.9],
    });
  });

  it("excludes a cumulative segment even when interval_index is null", () => {
    const entries: DropoffEntry[] = [
      { ...base, id: "full", component: "0-10m", display_value: 1.8 },
      { ...base, id: "segment", component: "5-10m", interval_index: null, display_value: 0.9 },
    ];
    expect(overallAttemptsFor(entries, "a1", "10m_Accel")).toEqual({
      units: "s",
      values: [1.8],
    });
  });

  it("keeps a null-component split and excludes a named split component", () => {
    const named: DropoffEntry = {
      ...base,
      id: "named",
      metric_key: "10-20m_Split",
      component: "10-20m",
      interval_index: null,
      display_value: 1.1,
    };
    const overall: DropoffEntry = {
      ...base,
      id: "overall",
      metric_key: "10-20m_Split",
      component: null,
      interval_index: null,
      display_value: "1.20",
    };
    expect(overallAttemptsFor([named], "a1", "10-20m_Split")).toBeNull();
    expect(overallAttemptsFor([named, overall], "a1", "10-20m_Split")).toEqual({
      units: "s",
      values: [1.2],
    });
  });

  it("returns the two 0-10yd acceleration marks and ignores the 0-20yd row", () => {
    const entries: DropoffEntry[] = [
      {
        ...base,
        id: "late",
        metric_key: "Acceleration",
        component: "0-10yd",
        display_value: "1.90",
        created_at: "2026-10-28T15:02:00.000Z",
        distance_unit: "yd",
        start_distance: "0" as unknown as number,
        end_distance: "10" as unknown as number,
      },
      {
        ...base,
        id: "early",
        metric_key: "Acceleration",
        component: "0-10yd",
        display_value: 1.7,
        created_at: "2026-10-28T15:01:00.000Z",
        distance_unit: "yd",
        start_distance: 0,
        end_distance: 10,
      },
      {
        ...base,
        id: "longer",
        metric_key: "Acceleration",
        component: "0-20yd",
        display_value: 2.8,
        distance_unit: "yd",
        start_distance: 0,
        end_distance: 20,
      },
    ];
    expect(
      overallAttemptsFor(entries, "a1", "Acceleration", {
        distance_unit: "yd",
        start_distance: 0,
        end_distance: 10,
      })
    ).toEqual({
      units: "s",
      values: [1.7, 1.9],
    });
  });
});

describe("isOverallDropoffView", () => {
  it("allows 10m_Accel with no component", () => {
    expect(isOverallDropoffView("10m_Accel", null, null)).toBe(true);
    expect(isOverallDropoffView("10m_Accel", "", null)).toBe(true);
  });

  it("allows 10m_Accel with the primary full-run component and no interval", () => {
    expect(isOverallDropoffView("10m_Accel", "0-10m", null)).toBe(true);
  });

  it("rejects a 10m_Accel segment chip", () => {
    expect(isOverallDropoffView("10m_Accel", "5-10m", null)).toBe(false);
  });

  it("rejects 10m_Accel when any interval is set", () => {
    expect(isOverallDropoffView("10m_Accel", null, 0)).toBe(false);
    expect(isOverallDropoffView("10m_Accel", "0-10m", 1)).toBe(false);
  });

  it("allows 10-20m_Split with no component and rejects the named split", () => {
    expect(isOverallDropoffView("10-20m_Split", null, null)).toBe(true);
    expect(isOverallDropoffView("10-20m_Split", "", null)).toBe(true);
    expect(isOverallDropoffView("10-20m_Split", "10-20m", null)).toBe(false);
  });

  it("allows Vertical Jump with no component", () => {
    expect(isOverallDropoffView("Vertical Jump", null, null)).toBe(true);
  });

  it("rejects a metric that is not on the drop-off list", () => {
    expect(isOverallDropoffView("40yd_Dash", null, null)).toBe(false);
    expect(isOverallDropoffView("40yd_Dash", "0-40yd", null)).toBe(false);
  });
});
