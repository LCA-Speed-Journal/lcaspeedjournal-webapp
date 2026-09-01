import { describe, it, expect } from "vitest";
import {
  ZONE_LABELS,
  ZONE_COLORS,
  zoneRank,
  isZoneLabel,
  isLiveLeaderboardZone,
} from "./palette";

describe("ZONE_LABELS", () => {
  it("is the six labels in display order worst to best", () => {
    expect(ZONE_LABELS).toEqual([
      "poor",
      "developmental",
      "efficient",
      "advanced",
      "elite",
      "world-class",
    ]);
  });
});

describe("zoneRank", () => {
  it("ranks world-class best (highest number)", () => {
    expect(zoneRank("poor")).toBeLessThan(zoneRank("efficient"));
    expect(zoneRank("elite")).toBeLessThan(zoneRank("world-class"));
  });
});

describe("isZoneLabel", () => {
  it("accepts palette keys only", () => {
    expect(isZoneLabel("elite")).toBe(true);
    expect(isZoneLabel("Efficient")).toBe(false);
    expect(isZoneLabel("")).toBe(false);
  });
});

describe("isLiveLeaderboardZone", () => {
  it("hides poor and developmental; shows efficient and better", () => {
    expect(isLiveLeaderboardZone("poor")).toBe(false);
    expect(isLiveLeaderboardZone("developmental")).toBe(false);
    expect(isLiveLeaderboardZone("efficient")).toBe(true);
    expect(isLiveLeaderboardZone("advanced")).toBe(true);
    expect(isLiveLeaderboardZone("elite")).toBe(true);
    expect(isLiveLeaderboardZone("world-class")).toBe(true);
    expect(isLiveLeaderboardZone(undefined)).toBe(false);
  });
});

describe("ZONE_COLORS", () => {
  it("has a color token for every label", () => {
    for (const label of ZONE_LABELS) {
      expect(ZONE_COLORS[label]).toMatch(/^#/);
    }
  });
});
