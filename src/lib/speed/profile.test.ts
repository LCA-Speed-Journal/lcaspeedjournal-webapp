import { describe, expect, it } from "vitest";
import { medianSegmentsForFlyLength, segmentsForFlyLength } from "./profile";

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
