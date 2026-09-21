import { describe, expect, it } from "vitest";
import {
  formatSeasonWeekDay,
  percentChange,
  seasonWeekDay,
  summarize,
} from "./stats";

describe("seasonWeekDay", () => {
  it("labels soccer T/F days from first logged session", () => {
    const anchor = "2026-09-11";
    const dates = ["2026-09-11", "2026-09-15", "2026-09-18"];
    expect(seasonWeekDay("2026-09-11", anchor, dates)).toEqual({
      week: 1,
      day: 1,
    });
    expect(seasonWeekDay("2026-09-15", anchor, dates)).toEqual({
      week: 2,
      day: 1,
    });
    expect(seasonWeekDay("2026-09-18", anchor, dates)).toEqual({
      week: 2,
      day: 2,
    });
    expect(formatSeasonWeekDay("2026-09-18", anchor, dates)).toBe("W2D2");
  });
});

describe("summarize", () => {
  it("returns min/mean/median/max", () => {
    expect(summarize([4, 1, 3, 2])).toEqual({
      min: 1,
      mean: 2.5,
      median: 2.5,
      max: 4,
    });
  });

  it("returns null for an empty list", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("percentChange", () => {
  it("is signed vs baseline", () => {
    expect(percentChange(5.0, 5.2)).toBeCloseTo(((5.0 - 5.2) / 5.2) * 100);
    expect(percentChange(22, 20)).toBeCloseTo(10);
  });

  it("returns null when baseline is 0", () => {
    expect(percentChange(1, 0)).toBeNull();
  });
});
