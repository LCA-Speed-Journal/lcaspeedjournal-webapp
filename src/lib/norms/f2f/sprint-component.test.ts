import { describe, expect, it } from "vitest";
import { canonicalSprintComponent } from "./sprint-component";

describe("canonicalSprintComponent", () => {
  it("adds a yd suffix and strips extra space", () => {
    expect(canonicalSprintComponent("10-20")).toBe("10-20yd");
    expect(canonicalSprintComponent("0-20")).toBe("0-20yd");
    expect(canonicalSprintComponent("5-10m")).toBe("5-10yd");
    expect(canonicalSprintComponent("10–20yd")).toBe("10-20yd");
    expect(canonicalSprintComponent("10 - 20 yd")).toBe("10-20yd");
  });

  it("leaves null and non-interval labels alone", () => {
    expect(canonicalSprintComponent(null)).toBeNull();
    expect(canonicalSprintComponent("Athlete-Comfort")).toBe("Athlete-Comfort");
  });
});
