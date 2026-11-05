import { describe, expect, it } from "vitest";
import { compareMark, SHARED_SOCCER_KEYS } from "./compare";

describe("compareMark", () => {
  it("calls a faster 40 an improvement", () => {
    const delta = compareMark("40yd_Dash", 4.9, 5.1);
    expect(delta).toMatchObject({ improved: true });
    expect(delta?.change).toBeCloseTo(-0.2);
  });

  it("calls a farther broad jump an improvement", () => {
    const delta = compareMark("Standing-Broad", 8.2, 7.6);
    expect(delta).toMatchObject({ improved: true });
    expect(delta?.change).toBeCloseTo(0.6);
  });

  it("returns null when soccer has no mark", () => {
    expect(compareMark("Standing-Broad", 8, null)).toBeNull();
  });

  it("does not compare RSI", () => {
    expect(SHARED_SOCCER_KEYS.has("10-5_RSI")).toBe(false);
    expect(SHARED_SOCCER_KEYS.has("DRI")).toBe(false);
    expect(SHARED_SOCCER_KEYS.has("10x10m_best")).toBe(false);
  });
});
