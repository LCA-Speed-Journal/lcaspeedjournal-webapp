import { describe, expect, it } from "vitest";
import { percentOf1Rm, percentOf1RmExtended } from "./relative-intensity";

describe("percentOf1Rm", () => {
  it("matches the Liberty chart at the checked cells", () => {
    expect(percentOf1Rm(1, 10)).toBeCloseTo(1, 3);
    // 87.5% × 0.90 intensity is 78.75%, which the chart shows as 78.8%.
    expect(percentOf1Rm(5, 8)).toBeCloseTo(0.7875, 4);
    expect(percentOf1Rm(3, 7)).toBeCloseTo(0.786, 3);
  });

  it("interpolates reps 7 and 9", () => {
    expect(percentOf1Rm(7, 10)).toBeCloseTo(0.825, 3);
    expect(percentOf1Rm(9, 10)).toBeCloseTo(0.7625, 3);
  });

  it("returns null when RPE is not finite", () => {
    expect(percentOf1Rm(5, Number.NaN)).toBeNull();
    expect(percentOf1Rm(5, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns null outside reps 1-10 or RPE 3-10", () => {
    expect(percentOf1Rm(0, 8)).toBeNull();
    expect(percentOf1Rm(11, 8)).toBeNull();
    expect(percentOf1Rm(5, 2.5)).toBeNull();
    expect(percentOf1Rm(5, 10.5)).toBeNull();
    expect(percentOf1Rm(5.5, 8)).toBeNull();
  });

  it("continues the 8-to-10 drop for a doubled lunge, and stops at 20", () => {
    expect(percentOf1Rm(12, 10)).toBeNull();
    expect(percentOf1RmExtended(12, 10)).toBeCloseTo(0.65, 5);
    expect(percentOf1RmExtended(6, 8)).toBeCloseTo(0.85 * 0.9, 5);
    expect(percentOf1RmExtended(21, 8)).toBeNull();
  });
});
