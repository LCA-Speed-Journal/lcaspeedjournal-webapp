import { describe, expect, it } from "vitest";
import { aggregateLiftSeries, type LiftLogRow } from "./lift-aggregate";

const rows: LiftLogRow[] = [
  {
    athlete_id: "a1",
    session_date: "2026-08-11",
    movement_name: "Tempo Goblet Squat",
    kind: "load_reps",
    load: 50,
  },
  {
    athlete_id: "a2",
    session_date: "2026-08-11",
    movement_name: "Goblet Squat",
    kind: "load_reps",
    load: 60,
  },
  {
    athlete_id: "a3",
    session_date: "2026-08-11",
    movement_name: "Front Squat",
    kind: "load_reps",
    load: 70,
  },
  {
    athlete_id: "a1",
    session_date: "2026-08-18",
    movement_name: "Tempo Goblet Squat",
    kind: "load_reps",
    load: 55,
  },
  {
    athlete_id: "a2",
    session_date: "2026-08-18",
    movement_name: "Goblet Squat",
    kind: "load_reps",
    load: 65,
  },
  {
    athlete_id: "a3",
    session_date: "2026-08-18",
    movement_name: "Front Squat",
    kind: "load_reps",
    load: 75,
  },
  {
    athlete_id: "a1",
    session_date: "2026-08-11",
    movement_name: "DB Bench (3RM Test)",
    kind: "load_reps",
    load: 80,
  },
  {
    athlete_id: "a2",
    session_date: "2026-08-11",
    movement_name: "Overhead Press",
    kind: "load_reps",
    load: 90,
  },
  {
    athlete_id: "a1",
    session_date: "2026-08-11",
    movement_name: "BB RDL (3RM Test)",
    kind: "load_reps",
    load: 185,
  },
  {
    athlete_id: "a2",
    session_date: "2026-08-11",
    movement_name: "Trap-Bar Deadlift",
    kind: "load_reps",
    load: 315,
  },
  {
    athlete_id: "a4",
    session_date: "2026-09-01",
    movement_name: "Hex Deadlift",
    kind: "load_reps",
    load: 200,
  },
];

describe("aggregateLiftSeries", () => {
  it("builds daily medians for squat/press/hinge and projects hex pulls onto hinge", () => {
    const series = aggregateLiftSeries(rows, 2);
    const squat = series.find((s) => s.lift_id === "squat")!;
    expect(squat.points.length).toBe(2);
    expect(squat.points[0]!.date).toBe("2026-08-11");
    expect(squat.points[0]!.median).toBe(60);
    expect(squat.points[1]!.date).toBe("2026-08-18");
    expect(squat.points[1]!.median).toBe(65);
    expect(squat.delta).toBe(5);

    const press = series.find((s) => s.lift_id === "press")!;
    expect(press.label.toLowerCase()).toMatch(/bench|press/);
    expect(press.points[0]!.n).toBe(2);

    const hinge = series.find((s) => s.lift_id === "hinge")!;
    const aug11 = hinge.points.find((p) => p.date === "2026-08-11");
    expect(aug11?.median).toBeCloseTo((185 + 315 / 1.15) / 2, 5);

    const hexDay = hinge.points.find((p) => p.date === "2026-09-01");
    expect(hexDay?.median).toBeCloseTo(200 / 1.15, 5);
    expect(hexDay?.median).not.toBe(200);

    expect(series.map((s) => s.lift_id).sort()).toEqual([
      "hinge",
      "press",
      "squat",
    ]);
  });
});
