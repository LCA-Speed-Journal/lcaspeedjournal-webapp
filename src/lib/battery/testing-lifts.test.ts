import { describe, expect, it } from "vitest";
import { testingLiftMovement } from "./testing-lifts";

describe("testingLiftMovement", () => {
  it("maps the board keys onto the weight-room names", () => {
    expect(testingLiftMovement("Bench-Press")).toBe("Bench Press");
    expect(testingLiftMovement("Hex-Deadlift")).toBe("Hex Deadlift");
    expect(testingLiftMovement("DRI")).toBeNull();
  });
});
