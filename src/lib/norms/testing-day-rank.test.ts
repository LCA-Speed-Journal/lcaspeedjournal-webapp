import { describe, it, expect } from "vitest";
import {
  compareScoredAthletes,
  formatPlace,
  isSprintFamilyMetric,
  pointsForPlace,
  rankMarksWithinGender,
  scoreAthleteTotals,
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

describe("scoreAthleteTotals", () => {
  it("averages sprint-family points and adds other tests", () => {
    const totals = scoreAthleteTotals({
      "40yd_Dash": 10,
      "20yd_Dash": 8,
      MaxVelocity: 6,
      "Vertical Jump": 7,
    });
    expect(totals.sprint_points).toBeCloseTo(8);
    expect(totals.total_points).toBeCloseTo(15);
  });

  it("omits missing sprint factors instead of treating them as 0", () => {
    const totals = scoreAthleteTotals({
      "40yd_Dash": 10,
      "Vertical Jump": 8,
    });
    expect(totals.sprint_points).toBe(10);
    expect(totals.total_points).toBe(18);
  });
});

describe("compareScoredAthletes", () => {
  it("sorts by total, then 40 rank, then 20 rank, then name", () => {
    const a = {
      athlete_id: "a",
      first_name: "Ann",
      last_name: "Zed",
      total_points: 18,
      rank_40: 2,
      rank_20: 1,
    };
    const b = {
      athlete_id: "b",
      first_name: "Bea",
      last_name: "Aye",
      total_points: 18,
      rank_40: 1,
      rank_20: 3,
    };
    expect(compareScoredAthletes(a, b, true, true)).toBeGreaterThan(0);
    expect(isSprintFamilyMetric("40yd_Dash")).toBe(true);
    expect(isSprintFamilyMetric("Vertical Jump")).toBe(false);
  });
});
