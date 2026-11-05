import { describe, expect, it } from "vitest";
import { scoreBatteryRows } from "./score-row";

const athletes = [
  {
    athlete_id: "a",
    first_name: "Ann",
    last_name: "Able",
    dri_marks: [
      { box: "12", value: 2.2 },
      { box: "18", value: 2.6 },
    ],
  },
  {
    athlete_id: "b",
    first_name: "Bea",
    last_name: "Baker",
    dri_marks: [{ box: "12", value: 1.4 }],
  },
];

const marks = [
  { athlete_id: "a", key: "10-5_RSI", value: 2.4 },
  { athlete_id: "a", key: "40yd_Dash", value: 4.8 },
  { athlete_id: "b", key: "10-5_RSI", value: 1.8 },
  { athlete_id: "b", key: "40yd_Dash", value: 5.1 },
];

describe("scoreBatteryRows", () => {
  it("scores each athlete from RSI, the 40, and DRI at the team box", () => {
    const rows = scoreBatteryRows({ athletes, marks, teamBox: "12" });
    const a = rows[0];
    const b = rows.find((row) => row.athlete_id === "b");

    expect(a.athlete_id).toBe("a");
    expect(a.cells["10-5_RSI"]).toMatchObject({
      rank: 1,
      points: 2,
      tied: false,
    });
    expect(a.cells.DRI).toMatchObject({
      value: 2.2,
      rank: 1,
      points: 2,
      tied: false,
    });
    expect(a.dri_band).toBe("Bouncy");
    expect(a.dri_peak_box).toBe("18");
    expect(a.higher_box).toBe(true);
    expect(b?.higher_box).toBe(false);
    expect(b?.cells.DRI.value).toBe(1.4);
    expect(a.total_points).toBeGreaterThan(b?.total_points ?? 0);
    expect(a.total_points).toBe(6);
    expect(a.sprint_points).toBe(2);
    expect(b?.total_points).toBe(3);
    expect(b?.sprint_points).toBe(1);
    expect(a.slots_completed).toBe(3);
    expect(b?.slots_completed).toBe(3);
    expect(a.cells["10x10m_best"]).toBeUndefined();
    expect(a.cells["10x10m_mean"]).toBeUndefined();
    expect(a.cells["10x10m_decrement"]).toBeUndefined();
    expect(b?.cells["10x10m_best"]).toBeUndefined();
    expect(b?.cells["10x10m_mean"]).toBeUndefined();
    expect(b?.cells["10x10m_decrement"]).toBeUndefined();
  });

  it("ranks a one-athlete pool against itself", () => {
    const rows = scoreBatteryRows({
      athletes,
      marks,
      teamBox: "12",
      poolIds: ["b"],
    });

    expect(rows.map((row) => row.athlete_id)).toEqual(["b"]);
    expect(rows[0].cells["10-5_RSI"]).toMatchObject({ rank: 1, points: 1 });
  });
});
