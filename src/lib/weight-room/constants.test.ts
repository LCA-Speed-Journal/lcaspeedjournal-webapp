import { describe, it, expect } from "vitest";
import {
  HUGO_GROUPS,
  HUGO_GROUP_META,
  FALL_IN_SEASON_GROUPS,
  defaultGenderForHugoGroup,
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
    expect(isHugoGroup("womens_tennis")).toBe(true);
    expect(isHugoGroup("womens_soccer")).toBe(true);
    expect(isHugoGroup("nordic_ski")).toBe(true);
    expect(isHugoGroup("golf")).toBe(true);
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
      "womens_tennis",
      "womens_soccer",
      "extracurricular",
    ]);
    expect(HUGO_GROUP_META.football).toEqual({ label: "Football", season: "fall" });
    expect(HUGO_GROUP_META.womens_tennis).toEqual({
      label: "Women's Tennis",
      season: "fall",
    });
    expect(HUGO_GROUP_META.womens_soccer).toEqual({
      label: "Women's Soccer",
      season: "fall",
    });
    expect(HUGO_GROUP_META.nordic_ski).toEqual({
      label: "Nordic Ski",
      season: "winter",
    });
    expect(HUGO_GROUP_META.golf).toEqual({ label: "Golf", season: "spring" });
    expect(HUGO_GROUP_META.soccer.season).toBe("fall");
    expect(HUGO_GROUP_META.extracurricular.season).toBe("year");
    expect(HUGO_GROUP_META.mens_basketball.season).toBe("winter");
    expect(HUGO_GROUP_META.baseball.season).toBe("spring");
  });
});

describe("defaultGenderForHugoGroup", () => {
  it("defaults women's teams and volleyball to F", () => {
    expect(defaultGenderForHugoGroup("volleyball")).toBe("F");
    expect(defaultGenderForHugoGroup("womens_basketball")).toBe("F");
    expect(defaultGenderForHugoGroup("womens_tennis")).toBe("F");
    expect(defaultGenderForHugoGroup("womens_soccer")).toBe("F");
  });

  it("defaults mixed and men's teams to M", () => {
    expect(defaultGenderForHugoGroup("soccer")).toBe("M");
    expect(defaultGenderForHugoGroup("football")).toBe("M");
    expect(defaultGenderForHugoGroup("xc")).toBe("M");
    expect(defaultGenderForHugoGroup("nordic_ski")).toBe("M");
    expect(defaultGenderForHugoGroup("golf")).toBe("M");
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
      "nordic_ski",
    ]);
    expect(printHeaderGroups("track")).toEqual(["track", "baseball", "golf"]);
  });
});
