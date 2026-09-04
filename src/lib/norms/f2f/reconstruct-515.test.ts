import { describe, expect, it } from "vitest";
import { mphFromYardSplit } from "../forty-yd";
import { reconstructFiveFifteen } from "./reconstruct-515";

describe("reconstructFiveFifteen", () => {
  it("returns a 5-15 time slower than half of 10-20 when still accelerating", () => {
    const hit = reconstructFiveFifteen(0.7, 1.3);
    expect(hit).not.toBeNull();
    const half = 0.7 + 1.3 / 2;
    expect(hit!.timeS).toBeGreaterThan(half);
    expect(hit!.timeS).toBeLessThan(0.7 + 1.3);
    expect(hit!.timeS).toBeCloseTo(1.365, 3);
    expect(hit!.mph).toBeCloseTo(mphFromYardSplit(hit!.timeS, 10)!, 6);
  });

  it("is constant speed when 10-20 takes twice 5-10", () => {
    const hit = reconstructFiveFifteen(0.7, 1.4);
    expect(hit!.timeS).toBeCloseTo(1.4, 8);
  });

  it("returns null for non-positive times", () => {
    expect(reconstructFiveFifteen(0, 1.3)).toBeNull();
    expect(reconstructFiveFifteen(0.7, -1)).toBeNull();
  });
});
