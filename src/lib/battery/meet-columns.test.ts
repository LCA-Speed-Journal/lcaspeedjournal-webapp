import { describe, expect, it } from "vitest";
import { MEET_COLUMN_ORDER, headerTintClass, meetColumnKeys, metricTint } from "./meet-columns";

describe("meet columns", () => {
  it("orders the finished meet from vertical through hex", () => {
    expect(MEET_COLUMN_ORDER).toEqual([
      "Vertical Jump",
      "10-5_RSI",
      "DRI",
      "Standing-Broad",
      "20yd_Dash",
      "40yd_Dash",
      "MaxVelocity",
      "10x10m_best",
      "10x10m_mean",
      "10x10m_decrement",
      "OH-MB_Throw",
      "Bench-Press",
      "Hex-Deadlift",
    ]);
  });

  it("keeps sprint columns when a 40 was entered and drops the raw 10x10 key", () => {
    const present = new Set(["Vertical Jump", "10x10m", "OH-MB_Throw"]);
    expect(meetColumnKeys(present, true)).toEqual([
      "Vertical Jump",
      "20yd_Dash",
      "40yd_Dash",
      "MaxVelocity",
      "OH-MB_Throw",
    ]);
  });

  it("tints each metric by category", () => {
    expect(metricTint("Vertical Jump")).toBe("power");
    expect(metricTint("Standing-Broad")).toBe("power");
    expect(metricTint("10-5_RSI")).toBe("speed");
    expect(metricTint("DRI")).toBe("speed");
    expect(metricTint("20yd_Dash")).toBe("speed");
    expect(metricTint("40yd_Dash")).toBe("speed");
    expect(metricTint("MaxVelocity")).toBe("speed");
    expect(metricTint("10x10m_best")).toBe("repeat");
    expect(metricTint("10x10m_mean")).toBe("repeat");
    expect(metricTint("10x10m_decrement")).toBe("repeat");
    expect(metricTint("OH-MB_Throw")).toBe("throw");
    expect(metricTint("Bench-Press")).toBe("strength");
    expect(metricTint("Hex-Deadlift")).toBe("strength");
    expect(metricTint("10yd_Split")).toBeNull();
  });

  it("uses a light header wash for each category", () => {
    expect(headerTintClass("Vertical Jump")).toBe("bg-purple-500/15");
    expect(headerTintClass("40yd_Dash")).toBe("bg-blue-500/15");
    expect(headerTintClass("10x10m_mean")).toBe("bg-green-500/15");
    expect(headerTintClass("OH-MB_Throw")).toBe("bg-orange-500/15");
    expect(headerTintClass("Hex-Deadlift")).toBe("bg-red-500/15");
    expect(headerTintClass("10yd_Split")).toBe("");
  });
});
