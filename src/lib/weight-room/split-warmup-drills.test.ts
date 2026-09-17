import { describe, it, expect } from "vitest";
import { splitWarmupDrills } from "./split-warmup-drills";

describe("splitWarmupDrills", () => {
  it("splits extracurricular middle-dot lists and extracts trailing dose", () => {
    const notes =
      "Spring ankle (bent-knee) 45s/leg · hip hike 15/side · lunge ISO acc. 60s/leg";
    expect(splitWarmupDrills(notes)).toEqual([
      { name: "Spring ankle (bent-knee)", dose: "45s/leg" },
      { name: "hip hike", dose: "15/side" },
      { name: "lunge ISO acc.", dose: "60s/leg" },
    ]);
  });

  it("keeps hyphenated words and dose ranges intact", () => {
    expect(splitWarmupDrills("Spring ankle (bent-knee) 45s/leg")).toEqual([
      { name: "Spring ankle (bent-knee)", dose: "45s/leg" },
    ]);
    expect(splitWarmupDrills("deep push-up ISO 45–60s")).toEqual([
      { name: "deep push-up ISO", dose: "45–60s" },
    ]);
    expect(splitWarmupDrills("deep push-up ISO 45-60s")).toEqual([
      { name: "deep push-up ISO", dose: "45-60s" },
    ]);
  });

  it("splits on em-dash and spaced en/hyphen list separators", () => {
    expect(
      splitWarmupDrills("Spring ankle 45s/leg — hip hike 15/side")
    ).toEqual([
      { name: "Spring ankle", dose: "45s/leg" },
      { name: "hip hike", dose: "15/side" },
    ]);
    expect(
      splitWarmupDrills("Spring ankle 45s/leg – hip hike 15/side")
    ).toHaveLength(2);
    expect(
      splitWarmupDrills("Spring ankle 45s/leg - hip hike 15/side")
    ).toHaveLength(2);
  });

  it("splits on semicolon and newlines", () => {
    expect(splitWarmupDrills("A 10s; B 20s")).toEqual([
      { name: "A", dose: "10s" },
      { name: "B", dose: "20s" },
    ]);
    expect(splitWarmupDrills("A 10s\nB 20s")).toHaveLength(2);
  });

  it("returns empty for blank input", () => {
    expect(splitWarmupDrills("")).toEqual([]);
    expect(splitWarmupDrills("   ")).toEqual([]);
  });

  it("keeps drills without a trailing dose", () => {
    expect(splitWarmupDrills("Prime-times · A-switch")).toEqual([
      { name: "Prime-times", dose: "" },
      { name: "A-switch", dose: "" },
    ]);
  });
});
