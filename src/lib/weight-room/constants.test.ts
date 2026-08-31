import { describe, it, expect } from "vitest";
import {
  HUGO_GROUPS,
  HUGO_GROUP_META,
  FALL_IN_SEASON_GROUPS,
  isHugoGroup,
  printHeaderGroups,
} from "./constants";

describe("isHugoGroup", () => {
  it("accepts all Hugo group keys including off-season sports", () => {
    for (const g of HUGO_GROUPS) {
      expect(isHugoGroup(g)).toBe(true);
    }
    expect(isHugoGroup("football")).toBe(true);
    expect(isHugoGroup("mens_basketball")).toBe(true);
    expect(isHugoGroup("womens_basketball")).toBe(true);
    expect(isHugoGroup("track")).toBe(true);
    expect(isHugoGroup("baseball")).toBe(true);
  });

  it("rejects empty, soccer-like, and Speed Journal athlete_type values", () => {
    expect(isHugoGroup("")).toBe(false);
    expect(isHugoGroup("Soccer")).toBe(false);
    expect(isHugoGroup("athlete")).toBe(false);
    expect(isHugoGroup(null)).toBe(false);
  });
});

describe("HUGO_GROUP_META", () => {
  it("has a label for every group key", () => {
    expect(Object.keys(HUGO_GROUP_META).sort()).toEqual([...HUGO_GROUPS].sort());
  });

  it("marks fall in-season groups as fall or year-round extra", () => {
    expect(FALL_IN_SEASON_GROUPS).toEqual([
      "soccer",
      "volleyball",
      "xc",
      "football",
      "extracurricular",
    ]);
    expect(HUGO_GROUP_META.football).toEqual({ label: "Football", season: "fall" });
    expect(HUGO_GROUP_META.soccer.season).toBe("fall");
    expect(HUGO_GROUP_META.extracurricular.season).toBe("year");
    expect(HUGO_GROUP_META.mens_basketball.season).toBe("winter");
    expect(HUGO_GROUP_META.baseball.season).toBe("spring");
  });
});

describe("printHeaderGroups", () => {
  it("lists only fall cohort sports on extra and in-season fall cards", () => {
    expect(printHeaderGroups("extracurricular")).toEqual(FALL_IN_SEASON_GROUPS);
    expect(printHeaderGroups("soccer")).toEqual(FALL_IN_SEASON_GROUPS);
    expect(printHeaderGroups("soccer")).toContain("football");
    expect(printHeaderGroups("football")).toEqual(FALL_IN_SEASON_GROUPS);
    expect(printHeaderGroups("soccer")).not.toContain("mens_basketball");
    expect(printHeaderGroups("soccer")).not.toContain("track");
  });

  it("lists only same-season sports once winter or spring cards exist", () => {
    expect(printHeaderGroups("mens_basketball")).toEqual([
      "mens_basketball",
      "womens_basketball",
    ]);
    expect(printHeaderGroups("track")).toEqual(["track", "baseball"]);
  });
});
