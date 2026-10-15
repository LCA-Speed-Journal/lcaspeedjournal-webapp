import { describe, expect, it } from "vitest";
import { lookupExercise, patternReference } from "./exercises";

describe("lookupExercise", () => {
  it("strips a test suffix and maps Hugo names", () => {
    expect(lookupExercise("DB Bench (3RM Test)")?.pattern).toBe("press");
    expect(lookupExercise("Goblet Squat (5RM Test)")?.ratio).toBeCloseTo(0.64, 5);
    expect(lookupExercise("Trap-Bar Deadlift")?.name).toBe("Hex Deadlift");
    expect(lookupExercise("BB RDL (Back-Offs)")?.pattern).toBe("hinge");
    expect(lookupExercise("Nordic / Slider Leg Curl")).toBeNull();
  });
});

describe("patternReference", () => {
  it("uses split squat for single-leg and hex deadlift for hinge", () => {
    expect(patternReference("single_leg").name).toBe("DB Split Squat");
    expect(patternReference("hinge").ratio).toBeCloseTo(1.15, 5);
  });
});
