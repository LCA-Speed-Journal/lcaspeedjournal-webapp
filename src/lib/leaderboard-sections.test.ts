import { describe, it, expect } from "vitest";
import { getLeaderboardSections } from "./leaderboard-sections";
import type { LeaderboardRow } from "@/types";

function row(id: string, athlete_type: LeaderboardRow["athlete_type"] = "athlete", gender = "M"): LeaderboardRow {
  return {
    rank: 1,
    athlete_id: id,
    first_name: "A",
    last_name: "B",
    gender,
    display_value: 10,
    units: "m",
    athlete_type,
  };
}

describe("getLeaderboardSections", () => {
  it("returns single section with empty title when neither toggle is on", () => {
    const rows: LeaderboardRow[] = [row("1"), row("2")];
    const result = getLeaderboardSections({
      rows,
      groupByGender: false,
      splitByAlumni: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("");
    expect(result[0].rows).toEqual(rows);
  });

  it("returns Athletes and Alumni sections when only splitByAlumni is on", () => {
    const a1 = row("1", "athlete");
    const a2 = row("2", "staff");
    const al = row("3", "alumni");
    const rows = [a1, a2, al];
    const result = getLeaderboardSections({
      rows,
      groupByGender: false,
      splitByAlumni: true,
    });
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Athletes");
    expect(result[0].rows).toEqual([a1, a2]);
    expect(result[1].title).toBe("Alumni");
    expect(result[1].rows).toEqual([al]);
  });

  it("treats missing athlete_type as athlete", () => {
    const r = row("1");
    (r as { athlete_type?: string }).athlete_type = undefined;
    const result = getLeaderboardSections({
      rows: [r],
      groupByGender: false,
      splitByAlumni: true,
    });
    expect(result[0].title).toBe("Athletes");
    expect(result[0].rows).toHaveLength(1);
  });

  it("returns Boys and Girls when only groupByGender is on", () => {
    const male = [row("1", "athlete", "M")];
    const female = [row("2", "athlete", "F")];
    const result = getLeaderboardSections({
      rows: [...male, ...female],
      male,
      female,
      groupByGender: true,
      splitByAlumni: false,
    });
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Boys");
    expect(result[0].rows).toEqual(male);
    expect(result[1].title).toBe("Girls");
    expect(result[1].rows).toEqual(female);
  });

  it("returns four sections when both toggles are on", () => {
    const maleAthletes = [row("1", "athlete", "M")];
    const femaleAthletes = [row("2", "athlete", "F")];
    const maleAlumni = [row("3", "alumni", "M")];
    const femaleAlumni = [row("4", "alumni", "F")];
    const male = [...maleAthletes, ...maleAlumni];
    const female = [...femaleAthletes, ...femaleAlumni];
    const result = getLeaderboardSections({
      rows: [...male, ...female],
      male,
      female,
      groupByGender: true,
      splitByAlumni: true,
    });
    expect(result).toHaveLength(4);
    expect(result[0].title).toBe("Athletes (Boys)");
    expect(result[0].rows).toEqual(maleAthletes);
    expect(result[1].title).toBe("Athletes (Girls)");
    expect(result[1].rows).toEqual(femaleAthletes);
    expect(result[2].title).toBe("Alumni (Boys)");
    expect(result[2].rows).toEqual(maleAlumni);
    expect(result[3].title).toBe("Alumni (Girls)");
    expect(result[3].rows).toEqual(femaleAlumni);
  });

  it("omits empty sections", () => {
    const athletes = [row("1", "athlete")];
    const result = getLeaderboardSections({
      rows: athletes,
      groupByGender: false,
      splitByAlumni: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Athletes");
    expect(result[0].rows).toEqual(athletes);
  });
});
