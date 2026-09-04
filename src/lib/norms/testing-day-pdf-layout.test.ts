import { describe, expect, it } from "vitest";
import type { TestingDayMatrixAthlete } from "./testing-day";
import {
  athleteSubline,
  formatPdfDate,
  formatPdfGrade,
  groupAthletesBySection,
  sectionHeading,
  sectionRanks,
  sectionSubhead,
} from "./testing-day-pdf-layout";

function athlete(
  partial: Partial<TestingDayMatrixAthlete> & Pick<TestingDayMatrixAthlete, "athlete_id">
): TestingDayMatrixAthlete {
  return {
    first_name: "A",
    last_name: "B",
    gender: "M",
    sport: "soccer",
    cells: {},
    ...partial,
  };
}

describe("sectionHeading", () => {
  it("prefixes Boys or Girls unless the sport label already has gender", () => {
    expect(sectionHeading("soccer", "M")).toBe("Testing Day: Boys Soccer");
    expect(sectionHeading("volleyball", "F")).toBe("Testing Day: Girls Volleyball");
    expect(sectionHeading("mens_basketball", "M")).toBe(
      "Testing Day: Men's Basketball"
    );
    expect(sectionHeading(null, null)).toBe("Testing Day: No primary sport");
  });
});

describe("formatPdfDate", () => {
  it("uses an ordinal local date", () => {
    expect(formatPdfDate("2026-09-02")).toBe("September 2nd, 2026");
    expect(formatPdfDate("2026-09-01")).toBe("September 1st, 2026");
    expect(formatPdfDate("2026-09-03")).toBe("September 3rd, 2026");
    expect(formatPdfDate("2026-09-11")).toBe("September 11th, 2026");
  });
});

describe("formatPdfGrade", () => {
  it("maps graduating class to 9th-12th and omits others", () => {
    expect(formatPdfGrade(2027, new Date("2026-09-04T12:00:00"))).toBe("12th");
    expect(formatPdfGrade(null, new Date("2026-09-04T12:00:00"))).toBeNull();
  });
});

describe("sectionSubhead", () => {
  it("joins date and athlete count", () => {
    expect(sectionSubhead("2026-09-02", 25)).toBe(
      "September 2nd, 2026 — 25 Athletes"
    );
    expect(sectionSubhead("2026-09-02", 1)).toBe(
      "September 2nd, 2026 — 1 Athlete"
    );
  });
});

describe("groupAthletesBySection", () => {
  it("sorts sport then boys before girls", () => {
    const sections = groupAthletesBySection([
      athlete({ athlete_id: "g", gender: "F", sport: "soccer" }),
      athlete({ athlete_id: "b", gender: "M", sport: "soccer" }),
      athlete({ athlete_id: "v", gender: "F", sport: "volleyball" }),
    ]);
    expect(sections.map((s) => `${s.sport}|${s.gender}`)).toEqual([
      "soccer|M",
      "soccer|F",
      "volleyball|F",
    ]);
    expect(sections[0].athletes.map((a) => a.athlete_id)).toEqual(["b"]);
  });
});

describe("sectionRanks", () => {
  it("re-ranks inside the section and marks sort ties", () => {
    const athletes = [
      athlete({
        athlete_id: "a",
        first_name: "Ann",
        last_name: "Aye",
        total_points: 20,
      }),
      athlete({
        athlete_id: "b",
        first_name: "Bea",
        last_name: "Bee",
        total_points: 20,
      }),
      athlete({
        athlete_id: "c",
        first_name: "Cal",
        last_name: "Coe",
        total_points: 10,
      }),
    ];
    const ranks = sectionRanks(athletes, false, false);
    expect(ranks.get("a")).toEqual({ rank: 1, tied: true });
    expect(ranks.get("b")).toEqual({ rank: 1, tied: true });
    expect(ranks.get("c")).toEqual({ rank: 3, tied: false });
  });
});

describe("athleteSubline", () => {
  it("joins place and grade, omitting a missing grade", () => {
    expect(athleteSubline({ rank: 1, tied: false }, "12th")).toBe("1st — 12th");
    expect(athleteSubline({ rank: 2, tied: true }, null)).toBe("T-2nd");
  });
});
