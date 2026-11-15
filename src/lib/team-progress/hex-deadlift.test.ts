import { describe, expect, it } from "vitest";
import { isHexDeadliftName, projectedConventionalDeadlift } from "./hex-deadlift";

describe("projectedConventionalDeadlift", () => {
  it("turns a 200 lb trap-bar pull into about 174 lb conventional", () => {
    expect(projectedConventionalDeadlift(200)).toBeCloseTo(200 / 1.15, 5);
  });
});

describe("isHexDeadliftName", () => {
  it("matches hex and trap-bar deadlifts, including a trap-bar 1RM", () => {
    expect(isHexDeadliftName("Hex Deadlift")).toBe(true);
    expect(isHexDeadliftName("Trap-Bar Deadlift")).toBe(true);
    expect(isHexDeadliftName("Trap Bar Deadlift")).toBe(true);
    expect(isHexDeadliftName("Trap Bar 1RM")).toBe(true);
  });

  it("does not match trap-bar jumps, plain deadlifts, or RDLs", () => {
    expect(isHexDeadliftName("Trap-Bar Jump")).toBe(false);
    expect(isHexDeadliftName("Trap-Bar Jump or Weighted VJ (Log)")).toBe(false);
    expect(isHexDeadliftName("Deadlift")).toBe(false);
    expect(isHexDeadliftName("RDL")).toBe(false);
    expect(isHexDeadliftName("Romanian Deadlift")).toBe(false);
  });
});
