import { describe, expect, it } from "vitest";
import type { BoardAthlete } from "./load";
import {
  formatStrengthPounds,
  isStrengthPoundDay,
  orderByStrengthPounds,
  strengthPounds,
} from "./strength-rank";

function athlete(id: string, last: string, cells: BoardAthlete["cells"]): BoardAthlete {
  return {
    athlete_id: id,
    bib: null,
    first_name: id,
    last_name: last,
    group_key: null,
    total_points: 0,
    rank_points: 0,
    slots_completed: 0,
    qualifier: null,
    higher_box: false,
    cells,
  };
}

const cell = (value: number) => ({ value, rank: 1, tied: false, points: 0 });

describe("strength pound ranking", () => {
  it("recognizes a day whose columns are only the two lifts", () => {
    expect(isStrengthPoundDay(["Bench-Press", "Hex-Deadlift"])).toBe(true);
    expect(isStrengthPoundDay(["Hex-Deadlift"])).toBe(true);
    expect(isStrengthPoundDay(["10x10m_best", "OH-MB_Throw"])).toBe(false);
    expect(isStrengthPoundDay([])).toBe(false);
  });

  it("sums the loads that exist", () => {
    expect(strengthPounds(athlete("a", "A", { "Bench-Press": cell(225), "Hex-Deadlift": cell(315) }))).toBe(540);
    expect(strengthPounds(athlete("b", "B", { "Hex-Deadlift": cell(400) }))).toBe(400);
    expect(strengthPounds(athlete("c", "C", {}))).toBeNull();
    expect(formatStrengthPounds(540)).toBe("540");
    expect(formatStrengthPounds(540.5)).toBe("540.5");
  });

  it("ranks by the sum, shares a place on a tie, and leaves untested athletes last", () => {
    const rows = orderByStrengthPounds(
      [
        athlete("low", "Low", { "Bench-Press": cell(185), "Hex-Deadlift": cell(200) }),
        athlete("none", "None", {}),
        athlete("single", "Single", { "Hex-Deadlift": cell(400) }),
        athlete("high", "High", { "Bench-Press": cell(225), "Hex-Deadlift": cell(315) }),
        athlete("tie-b", "Bee", { "Bench-Press": cell(200), "Hex-Deadlift": cell(200) }),
        athlete("tie-a", "Aye", { "Hex-Deadlift": cell(400) }),
      ],
      []
    );
    expect(rows.map((row) => [row.athlete.athlete_id, row.place])).toEqual([
      ["high", 1],
      ["tie-a", 2],
      ["tie-b", 2],
      ["single", 2],
      ["low", 5],
      ["none", null],
    ]);
  });
});
