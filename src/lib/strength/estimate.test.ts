import { describe, expect, it } from "vitest";
import { estimateSet, roundTo5Lb, suggestedLoad, toPatternReference } from "./estimate";

describe("estimateSet", () => {
  it("uses logged reps with the card RPE", () => {
    const est = estimateSet({
      movementName: "Trap-Bar Deadlift",
      load: 185,
      reps: 3,
      target: "3 @ RPE 8",
      rpeOverride: null,
    });
    expect(est?.rpe).toBe(8);
    expect(est?.exerciseE1rm).toBeCloseTo(185 / (0.925 * 0.9), 1);
  });

  it("rejects a non-finite RPE override", () => {
    expect(
      estimateSet({
        movementName: "Trap-Bar Deadlift",
        load: 185,
        reps: 3,
        target: "3 @ RPE 8",
        rpeOverride: Number.NaN,
      })
    ).toBeNull();
  });

  it("rejects an infinite load", () => {
    expect(
      estimateSet({
        movementName: "Trap-Bar Deadlift",
        load: Number.POSITIVE_INFINITY,
        reps: 3,
        target: "3 @ RPE 8",
        rpeOverride: null,
      })
    ).toBeNull();
  });

  it("skips a prescription with no load", () => {
    expect(
      estimateSet({
        movementName: "Trap-Bar Deadlift",
        load: null,
        reps: null,
        target: "3 @ RPE 8",
        rpeOverride: null,
      })
    ).toBeNull();
  });
});

describe("toPatternReference", () => {
  it("turns 100 lb goblet into about 125 lb front squat and 156 lb back squat", () => {
    const ref = toPatternReference("Goblet Squat", 100);
    expect(ref?.pattern).toBe("squat");
    expect(ref!.referenceE1rm * 0.8).toBeCloseTo(125, 1);
    expect(ref!.referenceE1rm).toBeCloseTo(100 / 0.64, 1);
  });

  it("puts a lunge on the split-squat line", () => {
    const ref = toPatternReference("DB Reverse Lunge", 80);
    expect(ref?.pattern).toBe("single_leg");
    expect(ref!.referenceE1rm).toBeCloseTo(80 / 0.8, 1);
    expect(ref!.referenceName).toBe("DB Split Squat");
  });
});

describe("suggestedLoad", () => {
  it("suggests about 55 lb per dumbbell from a 200 bench", () => {
    expect(suggestedLoad({
      pattern: "press",
      referenceE1rm: 200,
      movementName: "DB Bench",
      reps: 6,
      rpe: 8,
    })).toBe(55);
  });

  it("does not let a press max write the pull load", () => {
    const pull = suggestedLoad({
      pattern: "pull",
      referenceE1rm: 160,
      movementName: "Lat Pull Down",
      reps: 6,
      rpe: 8,
    });
    expect(pull).toBe(roundTo5Lb(160 * 0.765));
    expect(pull).not.toBe(roundTo5Lb(200 * 0.75 * 0.765));
  });

  it("rejects a negative pattern reference", () => {
    expect(
      suggestedLoad({
        pattern: "press",
        referenceE1rm: -200,
        movementName: "DB Bench",
        reps: 6,
        rpe: 8,
      })
    ).toBeNull();
  });
});
