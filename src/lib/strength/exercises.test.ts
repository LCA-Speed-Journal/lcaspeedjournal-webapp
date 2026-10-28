import { describe, expect, it } from "vitest";
import { isForwardToReverseLunge, lookupExercise, patternReference } from "./exercises";

describe("lookupExercise", () => {
  it("strips a test suffix and maps Hugo names", () => {
    expect(lookupExercise("DB Bench (3RM Test)")?.pattern).toBe("press");
    expect(lookupExercise("Goblet Squat (5RM Test)")?.ratio).toBeCloseTo(0.64, 5);
    expect(lookupExercise("Trap-Bar Deadlift")?.name).toBe("Hex Deadlift");
    expect(lookupExercise("BB RDL (Back-Offs)")?.pattern).toBe("hinge");
    expect(lookupExercise("Nordic / Slider Leg Curl")).toBeNull();
    expect(lookupExercise("DB Goblet Squat")?.pattern).toBe("squat");
    expect(lookupExercise("DB Goblet Squat")?.ratio).toBeCloseTo(0.64, 5);
    expect(lookupExercise("DB Forward-to-Reverse Lunge")?.name).toBe("Lunge");
    expect(lookupExercise("DB Bench Press")?.name).toBe("DB Bench");
    expect(lookupExercise("Row")?.name).toBe("BB BO Row");
    expect(lookupExercise("DB Row")).toBeNull();
    expect(lookupExercise("Bulgarian Split-Squat")?.name).toBe("DB Split Squat");
    expect(lookupExercise("Bulgarian Split-Squat")?.ratio).toBeCloseTo(0.5, 5);
    expect(lookupExercise("BB Deficit RDL")?.name).toBe("RDL");
    expect(lookupExercise("BB Deficit RDL")?.pattern).toBe("hinge");
    expect(lookupExercise("Deficit RDL")?.ratio).toBeCloseTo(0.75, 5);
    expect(lookupExercise("B-Stance RDL")?.name).toBe("RDL");
    expect(lookupExercise("DB B-Stance RDL")?.name).toBe("DB RDL");
    expect(lookupExercise("DB B-Stance RDL")?.ratio).toBeCloseTo(0.33, 5);
  });
});

describe("isForwardToReverseLunge", () => {
  it("matches the paired lunge and not a reverse lunge", () => {
    expect(isForwardToReverseLunge("DB Forward-to-Reverse Lunge")).toBe(true);
    expect(isForwardToReverseLunge("Forward-to-Reverse Lunge")).toBe(true);
    expect(isForwardToReverseLunge("Reverse Lunge")).toBe(false);
    expect(isForwardToReverseLunge("DB Reverse Lunge")).toBe(false);
  });
});

describe("patternReference", () => {
  it("uses split squat for single-leg and hex deadlift for hinge", () => {
    expect(patternReference("single_leg").name).toBe("DB Split Squat");
    expect(patternReference("hinge").ratio).toBeCloseTo(1.15, 5);
  });
});
