import { describe, it, expect } from "vitest";
import { segmentToCumulative, segmentInputToCumulativeInput } from "./parser";

describe("segmentToCumulative", () => {
  it("returns running sum of segment values", () => {
    expect(segmentToCumulative([1, 2, 3])).toEqual([1, 3, 6]);
  });

  it("returns single value unchanged", () => {
    expect(segmentToCumulative([0.95])).toEqual([0.95]);
  });

  it("handles decimal segment times", () => {
    expect(segmentToCumulative([0.95, 0.9, 0.8])).toEqual([0.95, 1.85, 2.65]);
  });
});

describe("segmentInputToCumulativeInput", () => {
  it("converts pipe-separated segment string to cumulative string", () => {
    expect(segmentInputToCumulativeInput("0.95|0.90|0.80")).toBe("0.95|1.85|2.65");
  });

  it("returns null when any part is non-numeric", () => {
    expect(segmentInputToCumulativeInput("0.95|foo|0.80")).toBeNull();
    expect(segmentInputToCumulativeInput("")).toBeNull();
  });

  it("trims parts", () => {
    expect(segmentInputToCumulativeInput(" 0.95 | 0.90 | 0.80 ")).toBe("0.95|1.85|2.65");
  });
});
