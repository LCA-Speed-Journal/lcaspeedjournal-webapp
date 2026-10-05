import { describe, expect, it } from "vitest";
import {
  assertAttendanceRange,
  enumerateDates,
  overlappingWeeks,
  scheduledDates,
} from "./dates";

describe("attendance dates", () => {
  it("rejects a range longer than 366 days", () => {
    expect(assertAttendanceRange("2026-01-01", "2027-01-02")).toEqual({
      ok: false,
      error: "Date range too long",
    });
  });

  it("splits a Mon–Sun week and keeps a partial week that starts Wednesday", () => {
    const weeks = overlappingWeeks("2026-10-07", "2026-10-11");
    expect(weeks).toEqual([
      { start: "2026-10-05", end: "2026-10-11" },
    ]);
  });

  it("schedules Mon/Wed inside the range, drops a cancel, and keeps an add", () => {
    const dates = scheduledDates({
      from: "2026-10-05",
      to: "2026-10-11",
      weekdays: [1, 3],
      edits: [
        { session_date: "2026-10-05", action: "cancel" },
        { session_date: "2026-10-06", action: "add" },
      ],
    });
    expect(dates).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("lists every calendar date in range", () => {
    expect(enumerateDates("2026-10-05", "2026-10-07")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
  });
});
