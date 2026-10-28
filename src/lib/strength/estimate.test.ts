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

  it("defaults a logged load with no RPE to 6", () => {
    const est = estimateSet({
      movementName: "Front  Squat",
      load: 55,
      reps: 6,
      target: "55x6",
      rpeOverride: null,
    });
    expect(est?.rpe).toBe(6);
    expect(est?.exerciseE1rm).toBeCloseTo(55 / (0.85 * 0.8), 1);
    expect(toPatternReference("Front  Squat", est!.exerciseE1rm)?.pattern).toBe("squat");
  });

  it("keeps an override on a load that has no card RPE", () => {
    const est = estimateSet({
      movementName: "Front Squat",
      load: 55,
      reps: 6,
      target: "55x6",
      rpeOverride: 7,
    });
    expect(est?.rpe).toBe(7);
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

  it("scores six forward-to-reverse reps as twelve lunges", () => {
    const paired = estimateSet({
      movementName: "DB Forward-to-Reverse Lunge",
      load: 50,
      reps: 6,
      target: "6 @ RPE 8",
      rpeOverride: null,
    });
    const reverse = estimateSet({
      movementName: "Reverse Lunge",
      load: 50,
      reps: 6,
      target: "6 @ RPE 8",
      rpeOverride: null,
    });
    expect(paired?.exerciseE1rm).toBeCloseTo(50 / (0.65 * 0.9), 1);
    expect(paired!.exerciseE1rm).toBeGreaterThan(reverse!.exerciseE1rm);
    expect(toPatternReference("DB Forward-to-Reverse Lunge", paired!.exerciseE1rm)?.pattern).toBe(
      "single_leg"
    );
  });

  it("estimates a 12-rep goblet squat on the back-squat line", () => {
    const est = estimateSet({
      movementName: "DB Goblet Squat",
      load: 50,
      reps: 12,
      target: "12 @ RPE 8",
      rpeOverride: null,
    });
    expect(est?.exerciseE1rm).toBeCloseTo(50 / (0.65 * 0.9), 1);
    expect(toPatternReference("DB Goblet Squat", est!.exerciseE1rm)?.pattern).toBe("squat");
  });

  it("sends the in-season names to squat, press, pull, and single-leg", () => {
    expect(toPatternReference("DB Goblet Squat", 100)?.pattern).toBe("squat");
    expect(toPatternReference("DB Goblet Squat", 100)?.referenceE1rm).toBeCloseTo(100 / 0.64, 1);
    expect(toPatternReference("DB Bench Press", 35)?.pattern).toBe("press");
    expect(toPatternReference("Row", 65)?.referenceName).toBe("Lat Pull Down");
    expect(toPatternReference("Bulgarian Split-Squat", 50)?.referenceName).toBe("DB Split Squat");
    expect(toPatternReference("DB Row", 65)).toBeNull();
    expect(toPatternReference("BB Deficit RDL", 135)?.referenceName).toBe("Hex Deadlift");
    expect(toPatternReference("DB B-Stance RDL", 40)?.pattern).toBe("hinge");
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
