import { describe, expect, it } from "vitest";
import {
  formatSeasonWeekDay,
  seasonWeekDay,
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
