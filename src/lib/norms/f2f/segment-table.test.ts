import { describe, expect, it } from "vitest";
import {
  estimateTwentyThirty,
  predict40FromTenTwenty,
  predict40FromTwenty,
} from "./segment-table";

describe("segment-table fits", () => {
  it("maps 10-20 to 20-30 as minus 0.10 across the table", () => {
    expect(estimateTwentyThirty(0.98)).toBeCloseTo(0.88, 8);
    expect(estimateTwentyThirty(1.16)).toBeCloseTo(1.06, 8);
    expect(estimateTwentyThirty(1.25)).toBeCloseTo(1.15, 8);
    expect(estimateTwentyThirty(1.4)).toBeCloseTo(1.3, 8);
  });

  it("predicts 40 from 0-20 on the table line", () => {
    expect(predict40FromTwenty(2.4)).toBeCloseTo(4.1, 1);
    expect(predict40FromTwenty(2.9)).toBeCloseTo(5.0, 2);
    expect(predict40FromTwenty(3.33)).toBeGreaterThan(5.45);
    expect(predict40FromTwenty(3.33)).toBeCloseTo(5.8, 1);
  });

  it("predicts 40 from 10-20 as 5x minus 0.80", () => {
    expect(predict40FromTenTwenty(0.98)).toBeCloseTo(4.1, 8);
    expect(predict40FromTenTwenty(1.16)).toBeCloseTo(5.0, 8);
    expect(predict40FromTenTwenty(1.28)).toBeCloseTo(5.6, 8);
  });

  it("returns null for non-positive times", () => {
    expect(estimateTwentyThirty(0.05)).toBeNull();
    expect(predict40FromTwenty(0)).toBeNull();
    expect(predict40FromTenTwenty(-1)).toBeNull();
  });
});
