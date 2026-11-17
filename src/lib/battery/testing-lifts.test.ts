import { describe, expect, it } from "vitest";
import { matchIsoRock } from "@/lib/team-progress/headlines";
import {
  DAY_B_STRENGTH_MOVEMENTS,
  strengthDurationSets,
  testingStrengthTitle,
  testingLiftMovement,
} from "./testing-lifts";

describe("testingLiftMovement", () => {
  it("maps the board keys onto the weight-room names", () => {
    expect(testingLiftMovement("Bench-Press")).toBe("Bench Press");
    expect(testingLiftMovement("Hex-Deadlift")).toBe("Hex Deadlift");
    expect(testingLiftMovement("DRI")).toBeNull();
  });
});

describe("day B strength", () => {
  it("prescribes both maxes and the four ISO rocks on one day", () => {
    expect(testingStrengthTitle("2026-11-17")).toBe("Testing Strength 2026-11-17");
    expect(DAY_B_STRENGTH_MOVEMENTS.map((movement) => [movement.name, movement.setCount, movement.targets])).toEqual([
      ["Bench Press", 1, ["1"]],
      ["Hex Deadlift", 1, ["1"]],
      ["ISO-Lunge", 2, ["30s", "30s"]],
      ["Spring Ankle", 2, ["45s", "45s"]],
      ["Copenhagens", 1, ["45s"]],
      ["Sprinter Bridging", 2, ["30s", "30s"]],
    ]);
    expect(matchIsoRock("ISO-Lunge")).toBe("iso_lunge");
    expect(matchIsoRock("Spring Ankle")).toBe("spring_ankle");
    expect(matchIsoRock("Copenhagens")).toBe("copenhagen");
    expect(matchIsoRock("Sprinter Bridging")).toBe("sprinter_bridge");
    expect(strengthDurationSets()).toEqual([
      { movementName: "ISO-Lunge", setIndex: 0, seconds: 30, rawText: "30s" },
      { movementName: "ISO-Lunge", setIndex: 1, seconds: 30, rawText: "30s" },
      { movementName: "Spring Ankle", setIndex: 0, seconds: 45, rawText: "45s" },
      { movementName: "Spring Ankle", setIndex: 1, seconds: 45, rawText: "45s" },
      { movementName: "Copenhagens", setIndex: 0, seconds: 45, rawText: "45s" },
      { movementName: "Sprinter Bridging", setIndex: 0, seconds: 30, rawText: "30s" },
      { movementName: "Sprinter Bridging", setIndex: 1, seconds: 30, rawText: "30s" },
    ]);
  });
});
