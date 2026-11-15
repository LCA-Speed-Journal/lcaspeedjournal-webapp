import { describe, expect, it } from "vitest";
import { projectedConventionalDeadlift } from "./hex-deadlift";

describe("projectedConventionalDeadlift", () => {
  it("turns a 200 lb trap-bar pull into about 174 lb conventional", () => {
    expect(projectedConventionalDeadlift(200)).toBeCloseTo(200 / 1.15, 5);
  });
});
