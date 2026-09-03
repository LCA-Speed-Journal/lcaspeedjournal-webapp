import { describe, it, expect } from "vitest";
import {
  formatPlace,
  pointsForPlace,
  rankMarksWithinGender,
} from "./testing-day-rank";

describe("pointsForPlace", () => {
  it("maps 1–8 to 10-8-7-6-4-3-2-1 and 9+ to 0", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(pointsForPlace)).toEqual([
      10, 8, 7, 6, 4, 3, 2, 1, 0, 0,
    ]);
  });
});

describe("rankMarksWithinGender", () => {
  it("ranks men and women separately with competition ties", () => {
    const ranked = rankMarksWithinGender(
      [
        { athlete_id: "m1", gender: "M", display_value: 4.5 },
        { athlete_id: "m2", gender: "M", display_value: 4.5 },
        { athlete_id: "m3", gender: "M", display_value: 4.7 },
        { athlete_id: "f1", gender: "F", display_value: 5.0 },
        { athlete_id: "u1", gender: null, display_value: 4.4 },
      ],
      true
    );
    const byId = Object.fromEntries(ranked.map((r) => [r.athlete_id, r]));
    expect(byId.m1).toMatchObject({ rank: 1, tied: true, points: 10 });
    expect(byId.m2).toMatchObject({ rank: 1, tied: true, points: 10 });
    expect(byId.m3).toMatchObject({ rank: 3, tied: false, points: 7 });
    expect(byId.f1).toMatchObject({ rank: 1, tied: false, points: 10 });
    expect(byId.u1).toMatchObject({ rank: 1, tied: false, points: 10 });
  });

  it("ranks higher mph better", () => {
    const ranked = rankMarksWithinGender(
      [
        { athlete_id: "a", gender: "M", display_value: 20.1 },
        { athlete_id: "b", gender: "M", display_value: 21.4 },
      ],
      false
    );
    expect(ranked.find((r) => r.athlete_id === "b")?.rank).toBe(1);
    expect(ranked.find((r) => r.athlete_id === "a")?.rank).toBe(2);
  });
});

describe("formatPlace", () => {
  it("uses ordinals and a T- prefix on ties", () => {
    expect(formatPlace(1, false)).toBe("1st");
    expect(formatPlace(2, true)).toBe("T-2nd");
    expect(formatPlace(3, false)).toBe("3rd");
    expect(formatPlace(11, false)).toBe("11th");
  });
});
