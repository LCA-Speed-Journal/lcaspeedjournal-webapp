import { describe, expect, it } from "vitest";
import { medianCurve, medianSegmentsForFlyLength, segmentsForFlyLength, speedDots } from "./profile";

describe("segmentsForFlyLength", () => {
  it("keeps 10yd flies and drops a 30yd fly", () => {
    const segments = segmentsForFlyLength(
      [
        { start_distance: 10, end_distance: 20, distance_unit: "yd", display_value: 20 },
        { start_distance: 10, end_distance: 20, distance_unit: "m", display_value: 18 },
        { start_distance: 10, end_distance: 40, distance_unit: "yd", display_value: 22 },
      ],
      "yd",
      10
    );
    expect(segments).toEqual([
      { x1: 10, x2: 20, mph: 20 },
    ]);
  });

  it("matches a fly length when distances arrive as numeric strings", () => {
    const segments = segmentsForFlyLength(
      [
        { start_distance: "10", end_distance: "20", distance_unit: "yd", display_value: "20.5" },
      ],
      "yd",
      10
    );
    expect(segments).toEqual([{ x1: 10, x2: 20, mph: 20.5 }]);
  });
});

describe("medianSegmentsForFlyLength", () => {
  it("uses the median mph at each start for one fly length", () => {
    const rows = [
      { start_distance: 10, end_distance: 20, distance_unit: "yd" as const, display_value: 20 },
      { start_distance: 10, end_distance: 20, distance_unit: "yd" as const, display_value: 22 },
      { start_distance: 20, end_distance: 30, distance_unit: "yd" as const, display_value: 18 },
      { start_distance: 10, end_distance: 40, distance_unit: "yd" as const, display_value: 30 },
    ];
    expect(medianSegmentsForFlyLength(rows, "yd", 10)).toEqual([
      { x1: 10, x2: 20, mph: 21 },
      { x1: 20, x2: 30, mph: 18 },
    ]);

    expect(
      medianSegmentsForFlyLength(
        [
          { start_distance: 10, end_distance: 20, distance_unit: "yd", display_value: 20 },
          { start_distance: 10, end_distance: 20, distance_unit: "yd", display_value: 21 },
          { start_distance: 10, end_distance: 20, distance_unit: "yd", display_value: 24 },
        ],
        "yd",
        10
      )
    ).toEqual([{ x1: 10, x2: 20, mph: 21 }]);
  });
});

describe("speedDots", () => {
  it("keeps each athlete's best non-spanning fly at the middle of the window", () => {
    const dots = speedDots([
      {
        athlete_id: "a1",
        athlete_name: "Ann",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-20yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 20,
        display_value: 18,
      },
      {
        athlete_id: "a1",
        athlete_name: "Ann",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-20yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 20,
        display_value: 20,
      },
      {
        athlete_id: "a1",
        athlete_name: "Ann",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-40yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 40,
        display_value: 22,
      },
    ]);
    expect(dots).toEqual([
      { athlete_id: "a1", athlete_name: "Ann", component: "10-20yd", x: 15, mph: 20, distance_unit: "yd" },
    ]);
  });
});

describe("medianCurve", () => {
  it("starts at 0 and uses the median mph at each midpoint", () => {
    const curve = medianCurve([
      { athlete_id: "a", athlete_name: "A", component: "5-10yd", x: 7.5, mph: 16, distance_unit: "yd" },
      { athlete_id: "b", athlete_name: "B", component: "5-10yd", x: 7.5, mph: 18, distance_unit: "yd" },
      { athlete_id: "a", athlete_name: "A", component: "10-20yd", x: 15, mph: 20, distance_unit: "yd" },
    ]);
    expect(curve).toEqual([
      { x: 0, mph: 0 },
      { x: 7.5, mph: 17 },
      { x: 15, mph: 20 },
    ]);
  });
});
