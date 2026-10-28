import { describe, expect, it } from "vitest";
import { overallAttemptsFor, type DropoffEntry } from "./attempts";

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
});
