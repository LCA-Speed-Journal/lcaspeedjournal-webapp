import { describe, expect, it } from "vitest";
import { batteryEntryKeys } from "./entry-metrics";

const REGISTRY = [
  "OH-MB_Throw",
  "10x10m",
  "Vertical Jump",
  "40yd_Dash",
  "Standing-Broad",
  "10-5_RSI",
];

describe("batteryEntryKeys", () => {
  it("uses the template day and ignores a stale session metric list", () => {
    expect(
      batteryEntryKeys({
        batterySession: true,
        sessionDate: "2026-11-17",
        dayMetrics: ["OH-MB_Throw"],
        registryKeys: REGISTRY,
      })
    ).toEqual(["Bench-Press", "Hex-Deadlift"]);

    expect(
      batteryEntryKeys({
        batterySession: true,
        sessionDate: "2026-11-20T00:00:00.000Z",
        dayMetrics: ["10x10m"],
        registryKeys: REGISTRY,
      })
    ).toEqual(["10x10m", "OH-MB_Throw"]);
  });

  it("offers Speed run once in place of a legacy dash key", () => {
    expect(
      batteryEntryKeys({
        batterySession: true,
        sessionDate: "2026-11-16",
        dayMetrics: ["OH-MB_Throw"],
        registryKeys: ["10-5_RSI", "SpeedRun", "DRI"],
      })
    ).toEqual(["10-5_RSI", "SpeedRun", "DRI"]);
  });

  it("uses the girls list on the shared Thursday date", () => {
    expect(
      batteryEntryKeys({
        batterySession: true,
        hugoGroup: "womens_basketball",
        sessionDate: "2026-11-19",
        dayMetrics: ["Vertical Jump"],
        registryKeys: REGISTRY,
      })
    ).toEqual(["SpeedRun", "Vertical Jump", "Standing-Broad", "10-5_RSI", "OH-MB_Throw"]);
  });

  it("keeps boys power on that same Thursday", () => {
    expect(
      batteryEntryKeys({
        batterySession: true,
        hugoGroup: "mens_basketball",
        sessionDate: "2026-11-19",
        dayMetrics: ["40yd_Dash"],
        registryKeys: REGISTRY,
      })
    ).toEqual(["Vertical Jump", "Standing-Broad"]);
  });

  it("keeps the session metric list when the session is not a battery day", () => {
    expect(
      batteryEntryKeys({
        batterySession: false,
        sessionDate: "2026-11-17",
        dayMetrics: ["40yd_Dash"],
        registryKeys: REGISTRY,
      })
    ).toEqual(["40yd_Dash"]);

    expect(
      batteryEntryKeys({
        batterySession: true,
        sessionDate: "2026-01-01",
        dayMetrics: null,
        registryKeys: REGISTRY,
      })
    ).toEqual(REGISTRY);
  });
});
