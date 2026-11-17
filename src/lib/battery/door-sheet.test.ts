import { describe, expect, it } from "vitest";
import { doorSheetAthletes, doorSheetColumnKeys } from "./door-sheet";
import type { BoardAthlete } from "./load";

function athlete(id: string, points: number, cells: BoardAthlete["cells"]): BoardAthlete {
  return {
    athlete_id: id,
    bib: null,
    first_name: id,
    last_name: id,
    group_key: null,
    total_points: points,
    slots_completed: points > 0 ? 1 : 0,
    qualifier: null,
    higher_box: false,
    cells,
  };
}

describe("doorSheetColumnKeys", () => {
  it("puts the unscored 0-10 first on day A and keeps other days on the board columns", () => {
    expect(doorSheetColumnKeys("A", ["20yd_Dash", "40yd_Dash"])).toEqual([
      "10yd_Split",
      "20yd_Dash",
      "40yd_Dash",
      "MaxVelocity",
      "10-5_RSI",
      "DRI",
    ]);
    expect(doorSheetColumnKeys("B", ["OH-MB_Throw", "Bench-Press"])).toEqual([
      "OH-MB_Throw",
      "Bench-Press",
    ]);
  });
});

describe("doorSheetAthletes", () => {
  it("drops athletes with no mark in the printed columns and places the rest", () => {
    const ten = { value: 1.7, rank: 1, tied: false, points: 2 };
    const rows = doorSheetAthletes(
      [
        athlete("empty", 0, {}),
        athlete("only-ten", 0, { "10yd_Split": ten }),
        athlete("fast", 12, { "40yd_Dash": { value: 4.8, rank: 1, tied: false, points: 12 } }),
      ],
      ["10yd_Split", "40yd_Dash"]
    );
    expect(rows.map((row) => row.athlete.athlete_id)).toEqual(["fast", "only-ten"]);
    expect(rows.map((row) => row.place)).toEqual([1, 2]);
  });
});
