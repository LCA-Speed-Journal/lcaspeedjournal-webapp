import { describe, it, expect } from "vitest";
import { computeLeaderboardTriggers } from "./leaderboardDiff";
import type { LeaderboardRow } from "@/types";

function row(overrides: Partial<LeaderboardRow> & { athlete_id: string; rank: number; display_value: number }): LeaderboardRow {
  return {
    athlete_id: overrides.athlete_id,
    rank: overrides.rank,
    first_name: "A",
    last_name: "B",
    gender: "m",
    display_value: overrides.display_value,
    units: "s",
    best_type: overrides.best_type,
    ...overrides,
  };
}

describe("computeLeaderboardTriggers", () => {
  it("returns empty map when prev is null (first load)", () => {
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const result = computeLeaderboardTriggers(null, next);
    expect(result.size).toBe(0);
  });

  it("returns empty map when prev is undefined", () => {
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const result = computeLeaderboardTriggers(undefined, next);
    expect(result.size).toBe(0);
  });

  it("assigns new-entry when athlete appears in next but not in prev", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const next = [
      row({ athlete_id: "1", rank: 2, display_value: 10 }),
      row({ athlete_id: "2", rank: 4, display_value: 9 }),
    ];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("2")).toBe("new-entry");
    expect(result.get("1")).toBeUndefined();
  });

  it("assigns new-entry-top-three when new athlete lands in rank 1-3", () => {
    const prev = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "2", rank: 2, display_value: 11 }),
      row({ athlete_id: "3", rank: 3, display_value: 12 }),
    ];
    const next = [
      row({ athlete_id: "4", rank: 1, display_value: 9 }),
      row({ athlete_id: "1", rank: 2, display_value: 10 }),
      row({ athlete_id: "2", rank: 3, display_value: 11 }),
      row({ athlete_id: "3", rank: 4, display_value: 12 }),
    ];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("4")).toBe("new-entry-top-three");
  });

  it("assigns new-top-three when existing athlete moves into top 3", () => {
    const prev = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "2", rank: 2, display_value: 11 }),
      row({ athlete_id: "3", rank: 3, display_value: 12 }),
      row({ athlete_id: "4", rank: 4, display_value: 13 }),
    ];
    const next = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "4", rank: 2, display_value: 10.5 }),
      row({ athlete_id: "2", rank: 3, display_value: 11 }),
      row({ athlete_id: "3", rank: 4, display_value: 12 }),
    ];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("4")).toBe("new-top-three");
  });

  it("assigns new-pb when best_type becomes pb", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: undefined })];
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: "pb" })];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("1")).toBe("new-pb");
  });

  it("assigns new-sb when best_type becomes sb", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: undefined })];
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: "sb" })];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("1")).toBe("new-sb");
  });

  it("assigns value-updated when display_value changes for same athlete", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const next = [row({ athlete_id: "1", rank: 1, display_value: 9.8 })];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("1")).toBe("value-updated");
  });

  it("returns empty map when data is identical", () => {
    const rows = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const result = computeLeaderboardTriggers(rows, rows);
    expect(result.size).toBe(0);
  });

  it("assigns new-entry when prev is empty and next has rows", () => {
    const next = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "2", rank: 2, display_value: 11 }),
    ];
    const result = computeLeaderboardTriggers([], next);
    expect(result.get("1")).toBe("new-entry-top-three");
    expect(result.get("2")).toBe("new-entry-top-three");
  });
});
