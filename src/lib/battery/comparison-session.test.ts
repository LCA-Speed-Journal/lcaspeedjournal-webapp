import { describe, expect, it } from "vitest";
import { pickComparisonSession } from "./comparison-session";

const sept2 = [
  { id: "empty-day", fortyCount: 0, soccerTagged: false },
  { id: "other-sport", fortyCount: 40, soccerTagged: false },
  { id: "soccer", fortyCount: 12, soccerTagged: true },
];

describe("pickComparisonSession", () => {
  it("prefers the soccer-tagged 40yd session over a larger unlabeled one", () => {
    expect(pickComparisonSession(sept2)).toBe("soccer");
  });

  it("uses the fullest 40yd session when none are tagged soccer", () => {
    expect(
      pickComparisonSession([
        { id: "a", fortyCount: 4, soccerTagged: false },
        { id: "b", fortyCount: 9, soccerTagged: false },
      ])
    ).toBe("b");
  });

  it("returns null when that date has no 40yd rows", () => {
    expect(pickComparisonSession([{ id: "a", fortyCount: 0, soccerTagged: true }])).toBeNull();
  });
});