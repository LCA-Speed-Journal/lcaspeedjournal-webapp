import { describe, expect, it } from "vitest";
import {
  buildAttendanceReport,
  type AttendanceReportInput,
} from "./report";

const week = { from: "2026-10-05", to: "2026-10-11" };

function baseInput(
  overrides: Partial<AttendanceReportInput> = {},
): AttendanceReportInput {
  return {
    hugo_group: "volleyball",
    from: week.from,
    to: week.to,
    weekdays: [1, 3],
    edits: [],
    members: [
      {
        athlete_id: "ada",
        first_name: "Ada",
        last_name: "A",
        enrollment: "liberty",
        joined_on: "2026-08-01",
      },
      {
        athlete_id: "ben",
        first_name: "Ben",
        last_name: "B",
        enrollment: "homeschool",
        joined_on: "2026-08-01",
      },
      {
        athlete_id: "cam",
        first_name: "Cam",
        last_name: "C",
        enrollment: "coop",
        joined_on: "2026-10-08",
      },
      {
        athlete_id: "dee",
        first_name: "Dee",
        last_name: "D",
        enrollment: null,
        joined_on: "2026-08-01",
      },
    ],
    present: [
      { athlete_id: "ada", session_date: "2026-10-05" },
      { athlete_id: "cam", session_date: "2026-10-07" },
      { athlete_id: "dee", session_date: "2026-10-06" },
    ],
    games: [],
    ...overrides,
  };
}

describe("buildAttendanceReport", () => {
  it("scores headcount, session fill, splits, and a non-scheduled present mark", () => {
    const report = buildAttendanceReport(baseInput());
    expect(report.scheduled_dates).toEqual(["2026-10-05", "2026-10-07"]);
    expect(report.team.headcount).toEqual({ present: 3, possible: 4, pct: 75 });
    expect(report.team.session_fill).toEqual({ present: 2, possible: 8, pct: 25 });
    expect(report.splits.liberty.headcount.pct).toBe(100);
    expect(report.splits.homeschool.headcount.pct).toBe(0);
    expect(report.splits.coop.session_fill).toEqual({
      present: 1,
      possible: 2,
      pct: 50,
    });
    expect(report.unset_count).toBe(1);
    expect(report.days.find((d) => d.date === "2026-10-06")?.count).toBe(1);
    const dee = report.athletes.find((a) => a.athlete_id === "dee");
    expect(dee?.session_rate).toEqual({ present: 0, possible: 2, pct: 0 });
    expect(dee?.week_rate.pct).toBe(100);
  });

  it("counts a card and a testing entry on the same day once", () => {
    const report = buildAttendanceReport(
      baseInput({
        present: [
          { athlete_id: "ada", session_date: "2026-10-05" },
          { athlete_id: "ada", session_date: "2026-10-05" },
        ],
      }),
    );
    expect(report.days.find((d) => d.date === "2026-10-05")?.count).toBe(1);
  });

  it("keeps a zero-attendance rhythm day in the denominator", () => {
    const report = buildAttendanceReport(baseInput({ present: [] }));
    expect(report.team.session_fill.possible).toBe(8);
    expect(report.team.session_fill.pct).toBe(0);
    expect(report.team.headcount.pct).toBe(0);
  });

  it("omits a fully cancelled week from session fill and still averages headcount at 0", () => {
    const report = buildAttendanceReport(
      baseInput({
        present: [],
        edits: [
          { session_date: "2026-10-05", action: "cancel" },
          { session_date: "2026-10-07", action: "cancel" },
        ],
      }),
    );
    expect(report.team.session_fill.pct).toBeNull();
    expect(report.team.headcount.pct).toBe(0);
  });

  it("leaves a late join out of earlier weeks", () => {
    const report = buildAttendanceReport(
      baseInput({
        from: "2026-09-28",
        to: "2026-10-11",
        present: [{ athlete_id: "cam", session_date: "2026-09-30" }],
      }),
    );
    const first = report.weeks[0];
    expect(first.start).toBe("2026-09-28");
    expect(first.roster_ids).not.toContain("cam");
    expect(report.weeks[1].roster_ids).toContain("cam");
  });

  it("marks a saved game and ignores a dismissed one", () => {
    const report = buildAttendanceReport(
      baseInput({
        games: [
          { contest_date: "2026-10-06", dismissed: false },
          { contest_date: "2026-10-07", dismissed: true },
        ],
      }),
    );
    expect(report.days.find((d) => d.date === "2026-10-06")?.game).toBe(true);
    expect(report.days.find((d) => d.date === "2026-10-07")?.game).toBe(false);
    expect(report.scheduled_dates).toEqual(["2026-10-05", "2026-10-07"]);
  });

  it("returns null session fill when the sport has no weekdays and no adds", () => {
    const report = buildAttendanceReport(baseInput({ weekdays: [] }));
    expect(report.team.session_fill.pct).toBeNull();
    expect(report.needs_rhythm).toBe(true);
  });

  it("ignores a present mark for someone who is not on the roster", () => {
    const withoutGuest = buildAttendanceReport(baseInput());
    const withGuest = buildAttendanceReport(
      baseInput({
        present: [
          ...baseInput().present,
          { athlete_id: "sam", session_date: "2026-10-05" },
        ],
      }),
    );
    expect(withGuest.team).toEqual(withoutGuest.team);
    expect(withGuest.athletes.map((athlete) => athlete.athlete_id)).not.toContain(
      "sam",
    );
  });
});
