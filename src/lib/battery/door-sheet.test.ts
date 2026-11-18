import { describe, expect, it } from "vitest";
import {
  DOOR_SHEET_TITLE,
  doorSheetAthletes,
  doorSheetAthleteName,
  doorSheetColumnKeys,
  doorSheetColumns,
  doorSheetDayHeading,
  doorSheetRankLabel,
  doorSheetTotalHeader,
  doorSheetTotalText,
} from "./door-sheet";
import type { BoardAthlete } from "./load";

function athlete(id: string, points: number, cells: BoardAthlete["cells"]): BoardAthlete {
  return {
    athlete_id: id,
    bib: null,
    first_name: id,
    last_name: id,
    group_key: null,
    total_points: points,
    rank_points: 0,
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

  it("labels the scored DRI height and keeps the 0-10 out of the points", () => {
    const columns = doorSheetColumns(
      "A",
      [{ key: "DRI", label: "DRI @ 12in", units: "DRI" }],
      "12"
    );
    expect(columns.find((column) => column.key === "DRI")).toMatchObject({
      label: "DRI-12",
      scored: true,
    });
    expect(columns.find((column) => column.key === "10yd_Split")).toMatchObject({
      label: "0-10*",
      scored: false,
    });
    expect(doorSheetColumns("A", [], "18").find((column) => column.key === "DRI")?.label).toBe(
      "DRI-18"
    );
  });

  it("keeps a girls day on the board columns and scores bench", () => {
    expect(
      doorSheetColumnKeys("A", ["20yd_Dash", "Vertical Jump", "10-5_RSI"])
    ).toEqual(["20yd_Dash", "Vertical Jump", "10-5_RSI"]);
    const columns = doorSheetColumns(
      "B",
      [
        { key: "Bench-Press", label: "Bench", units: "lb" },
        { key: "Hex-Deadlift", label: "Hex DL", units: "lb" },
      ],
      null
    );
    expect(columns.find((column) => column.key === "Bench-Press")).toMatchObject({
      label: "Bench",
      scored: true,
    });
    expect(doorSheetRankLabel({ rank: 1, tied: false, points: 4 }, true)).toBe("1 - 4pts");
    const girls = doorSheetColumns(
      "A",
      [
        { key: "20yd_Dash", label: "20yd", units: "s" },
        { key: "Vertical Jump", label: "Vertical", units: "in" },
      ],
      null
    );
    expect(girls.find((column) => column.key === "20yd_Dash")?.label).toBe("20yd");
  });
});

describe("door sheet labels", () => {
  it("puts the bib on the name and the place points beside the rank", () => {
    expect(
      doorSheetAthleteName({ first_name: "Graeme", last_name: "Hayes", bib: "103" })
    ).toBe("Hayes, Graeme (103)");
    expect(doorSheetRankLabel({ rank: 1, tied: false, points: 10 }, true)).toBe("1 - 10pts");
    expect(doorSheetRankLabel({ rank: 2, tied: true, points: 8 }, true)).toBe("T2 - 8pts");
    expect(doorSheetRankLabel({ rank: 9, tied: false, points: 0 }, true)).toBe("9");
    expect(doorSheetRankLabel({ rank: 13, tied: true, points: 0 }, true)).toBe("T13");
    expect(doorSheetRankLabel({ rank: 1, tied: false, points: 10 }, false)).toBe("1");
    expect(DOOR_SHEET_TITLE).toBe("Liberty Boys Basketball: Baseline Testing Assessment");
    expect(doorSheetDayHeading("A", "Rate and Reactivity")).toBe("Day A: Rate and Reactivity");
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

  it("ranks a strength day by total pounds and labels the total column Lb", () => {
    const rows = doorSheetAthletes(
      [
        athlete("low", 0, {
          "Bench-Press": { value: 185, rank: 2, tied: false, points: 0 },
          "Hex-Deadlift": { value: 275, rank: 2, tied: false, points: 0 },
        }),
        athlete("high", 0, {
          "Bench-Press": { value: 225, rank: 1, tied: false, points: 0 },
          "Hex-Deadlift": { value: 315, rank: 1, tied: false, points: 0 },
        }),
      ],
      ["Bench-Press", "Hex-Deadlift"]
    );
    expect(rows.map((row) => row.athlete.athlete_id)).toEqual(["high", "low"]);
    expect(rows.map((row) => row.place)).toEqual([1, 2]);
    expect(doorSheetTotalHeader(["Bench-Press", "Hex-Deadlift"])).toBe("Lb");
    expect(doorSheetTotalText(["Bench-Press", "Hex-Deadlift"], rows[0]!.athlete)).toBe("540");
    expect(doorSheetTotalHeader(["OH-MB_Throw"])).toBe("Pts");
  });
});
