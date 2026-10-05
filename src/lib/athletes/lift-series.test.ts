import { describe, expect, it } from "vitest";
import { athleteLiftSeries } from "./lift-series";

describe("athleteLiftSeries", () => {
  it("takes each day's best load_reps per squat/press/hinge", () => {
    const series = athleteLiftSeries([
      {
        session_date: "2026-08-11",
        movement_name: "Goblet Squat",
        kind: "load_reps",
        load: 50,
      },
      {
        session_date: "2026-08-11",
        movement_name: "Goblet Squat",
        kind: "load_reps",
        load: 55,
      },
      {
        session_date: "2026-08-18",
        movement_name: "Front Squat",
        kind: "load_reps",
        load: 65,
      },
      {
        session_date: "2026-08-11",
        movement_name: "Trap Bar Deadlift",
        kind: "load_reps",
        load: 200,
      },
    ]);
    const squat = series.find((s) => s.lift_id === "squat")!;
    expect(squat.points).toEqual([
      { date: "2026-08-11", value: 55 },
      { date: "2026-08-18", value: 65 },
    ]);
    expect(series.find((s) => s.lift_id === "hinge")).toBeUndefined();
  });
});
