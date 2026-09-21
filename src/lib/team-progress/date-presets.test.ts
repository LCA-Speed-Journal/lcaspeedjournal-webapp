import { describe, expect, it } from "vitest";
import { schoolYearRange, speedJournalSchoolYearRange } from "./date-presets";

describe("speedJournalSchoolYearRange", () => {
  it("uses Aug 1 this year through June 6 next year after August 1", () => {
    expect(speedJournalSchoolYearRange(new Date("2026-09-21T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
  });

  it("uses the year that just ended between June 7 and July 31", () => {
    expect(speedJournalSchoolYearRange(new Date("2027-06-10T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
    expect(speedJournalSchoolYearRange(new Date("2027-07-15T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
  });

  it("uses previous Aug 1 through this June 6 in January", () => {
    expect(speedJournalSchoolYearRange(new Date("2027-01-15T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
  });

  it("does not change the Team Progress Jul 31 school-year preset", () => {
    expect(schoolYearRange(new Date("2026-09-21T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-07-31",
    });
  });
});
