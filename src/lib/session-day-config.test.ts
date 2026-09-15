import { describe, expect, it } from "vitest";
import { sanitizeDayComponents, sanitizeDaySplits } from "./session-day-config";

describe("sanitizeDaySplits", () => {
  it("keeps positive gate distances", () => {
    expect(sanitizeDaySplits({ "40yd_Dash": [10, 10, 20] })).toEqual({
      "40yd_Dash": [10, 10, 20],
    });
  });

  it("returns null for empty or invalid", () => {
    expect(sanitizeDaySplits(null)).toBeNull();
    expect(sanitizeDaySplits({ "40yd_Dash": [0, 10] })).toBeNull();
  });
});

describe("sanitizeDayComponents", () => {
  it("keeps named 40yd flies", () => {
    expect(
      sanitizeDayComponents({ "40yd_Dash": ["5-15yd", "20-30yd"] })
    ).toEqual({ "40yd_Dash": ["5-15yd", "20-30yd"] });
  });

  it("drops zero-start and unknown 40yd labels", () => {
    expect(
      sanitizeDayComponents({
        "40yd_Dash": ["0-40yd", "5-15yd", "bogus"],
      })
    ).toEqual({ "40yd_Dash": ["5-15yd"] });
  });

  it("returns null when nothing valid remains", () => {
    expect(sanitizeDayComponents({ "40yd_Dash": ["0-10yd"] })).toBeNull();
  });
});
