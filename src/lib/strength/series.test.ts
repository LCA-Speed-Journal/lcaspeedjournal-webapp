import { describe, expect, it } from "vitest";
import { buildPatternSeries, latestReferenceBefore, seedPatternsFromAnchors } from "./series";

const pressDay = {
  athleteId: "a",
  date: "2026-10-01",
  movementName: "DB Shoulder Press",
  load: 50,
  reps: 5,
  target: "5 @ RPE 8",
  rpeOverride: null,
};

describe("buildPatternSeries", () => {
  it("updates press and leaves pull empty when only a press set exists", () => {
    const series = buildPatternSeries([pressDay]);
    expect(series.find((p) => p.pattern === "press")?.points).toHaveLength(1);
    expect(series.find((p) => p.pattern === "pull")?.points).toHaveLength(0);
  });

  it("keeps the heavier estimated set when two land the same day", () => {
    const series = buildPatternSeries([
      pressDay,
      { ...pressDay, load: 40, movementName: "DB Bench" },
    ]);
    const press = series.find((p) => p.pattern === "press")!;
    expect(press.points).toHaveLength(1);
    expect(press.points[0].sourceMovement).toBe("DB Shoulder Press");
  });
});

describe("seedPatternsFromAnchors", () => {
  it("snapshots hinge, single-leg, and pull once", () => {
    expect(seedPatternsFromAnchors({ squat: 300, bench: 200, power: 100 })).toEqual({
      squat: 300,
      press: 200,
      power: 100,
      hinge: 345,
      single_leg: 150,
      pull: 150,
    });
  });
});

describe("latestReferenceBefore", () => {
  it("excludes the same date and returns the earlier point", () => {
    const series = buildPatternSeries([
      pressDay,
      { ...pressDay, date: "2026-10-08", load: 55 },
    ]);
    const points = series.find((p) => p.pattern === "press")!.points;
    expect(latestReferenceBefore(points, "2026-10-08")?.date).toBe("2026-10-01");
    expect(latestReferenceBefore(points, "2026-10-01")).toBeNull();
  });
});
