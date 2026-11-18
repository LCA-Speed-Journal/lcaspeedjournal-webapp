import { describe, expect, it } from "vitest";
import { PLACE_POINTS, STRENGTH_PLACE_POINTS, placeScore, rankFullField } from "./rank";

describe("rankFullField", () => {
  it("pays the 8-place scale and stops at eighth", () => {
    const ranked = rankFullField(
      Array.from({ length: 10 }, (_, index) => ({
        athlete_id: String(index),
        value: 10 - index,
      })),
      "higher"
    );
    expect(ranked.find((row) => row.athlete_id === "0")).toMatchObject({
      rank: 1,
      tied: false,
      points: 10,
      order_points: 0,
    });
    expect(ranked.find((row) => row.athlete_id === "7")).toMatchObject({
      rank: 8,
      points: 1,
      order_points: 0,
    });
    expect(ranked.find((row) => row.athlete_id === "8")).toMatchObject({
      rank: 9,
      points: 0,
      order_points: 0.5,
    });
    expect(ranked.find((row) => row.athlete_id === "9")).toMatchObject({
      rank: 10,
      points: 0,
      order_points: 0.25,
    });
  });

  it("shares the place's points on a tie and skips the next place", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "a", value: 10 },
        { athlete_id: "b", value: 10 },
        { athlete_id: "c", value: 8 },
      ],
      "higher"
    );
    expect(ranked.find((row) => row.athlete_id === "a")).toMatchObject({
      rank: 1,
      tied: true,
      points: 10,
    });
    expect(ranked.find((row) => row.athlete_id === "b")).toMatchObject({
      rank: 1,
      tied: true,
      points: 10,
    });
    expect(ranked.find((row) => row.athlete_id === "c")).toMatchObject({
      rank: 3,
      tied: false,
      points: 6,
    });
  });

  it("treats a lower time as better", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "slow", value: 5.2 },
        { athlete_id: "fast", value: 4.8 },
      ],
      "lower"
    );
    expect(ranked.find((row) => row.athlete_id === "fast")).toMatchObject({
      rank: 1,
      points: 10,
    });
    expect(ranked.find((row) => row.athlete_id === "slow")?.points).toBe(8);
  });

  it("pays 4, 4, 4, 3, 3, 2, 2, 1 on the strength scale", () => {
    expect(STRENGTH_PLACE_POINTS).toEqual([4, 4, 4, 3, 3, 2, 2, 1]);
    expect(placeScore(1, STRENGTH_PLACE_POINTS)).toEqual({ points: 4, order_points: 0 });
    expect(placeScore(3, STRENGTH_PLACE_POINTS)).toEqual({ points: 4, order_points: 0 });
    expect(placeScore(5, STRENGTH_PLACE_POINTS)).toEqual({ points: 3, order_points: 0 });
    expect(placeScore(8, STRENGTH_PLACE_POINTS)).toEqual({ points: 1, order_points: 0 });
    expect(placeScore(9, STRENGTH_PLACE_POINTS)).toEqual({ points: 0, order_points: 0.5 });
    const ranked = rankFullField(
      [
        { athlete_id: "a", value: 300 },
        { athlete_id: "b", value: 250 },
        { athlete_id: "c", value: 200 },
      ],
      "higher",
      STRENGTH_PLACE_POINTS
    );
    expect(ranked.map((row) => row.points)).toEqual([4, 4, 4]);
    expect(placeScore(1)).toEqual({ points: PLACE_POINTS[0], order_points: 0 });
  });
});
