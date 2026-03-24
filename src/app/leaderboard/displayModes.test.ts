import { describe, expect, it } from "vitest";
import type { LeaderboardRow } from "@/types";
import {
  applyTopN,
  applyTopNToSections,
  buildGenderColumnsFromSections,
  buildGenderColumnModel,
  clampTopN,
  getGridClass,
} from "./displayModes";

describe("displayModes top-N helpers", () => {
  it("clamps topN to safe bounds", () => {
    expect(clampTopN(0)).toBe(1);
    expect(clampTopN(10)).toBe(10);
    expect(clampTopN(999)).toBe(50);
  });

  it("returns original rows when topN is disabled", () => {
    expect(applyTopN([1, 2, 3], 2, false)).toEqual([1, 2, 3]);
  });

  it("truncates rows when topN is enabled", () => {
    expect(applyTopN([1, 2, 3, 4], 2, true)).toEqual([1, 2]);
  });
});

describe("displayModes section and grid helpers", () => {
  it("applies topN per section independently", () => {
    const sections = [
      { title: "A", rows: [{ athlete_id: "1" }, { athlete_id: "2" }] as LeaderboardRow[] },
      { title: "B", rows: [{ athlete_id: "3" }, { athlete_id: "4" }] as LeaderboardRow[] },
    ];
    const out = applyTopNToSections(sections, 1, true);
    expect(out[0].rows).toHaveLength(1);
    expect(out[1].rows).toHaveLength(1);
  });

  it("returns grid classes for default and wide modes", () => {
    expect(getGridClass({ wideMode: false })).toContain("sm:grid-cols-3");
    expect(getGridClass({ wideMode: true })).toContain("lg:grid-cols-5");
  });
});

describe("displayModes split-gender model", () => {
  it("builds topN-truncated male and female columns", () => {
    const male = [{ athlete_id: "m1" }, { athlete_id: "m2" }] as LeaderboardRow[];
    const female = [{ athlete_id: "f1" }, { athlete_id: "f2" }] as LeaderboardRow[];
    const out = buildGenderColumnModel({ male, female, topN: 1, topNEnabled: true });
    expect(out.male).toHaveLength(1);
    expect(out.female).toHaveLength(1);
  });

  it("maps split-by-alumni grouped sections into boys/girls column sections", () => {
    const sections = [
      { title: "Athletes (Boys)", rows: [{ athlete_id: "m1" }] as LeaderboardRow[] },
      { title: "Athletes (Girls)", rows: [{ athlete_id: "f1" }] as LeaderboardRow[] },
      { title: "Alumni (Boys)", rows: [{ athlete_id: "m2" }] as LeaderboardRow[] },
      { title: "Alumni (Girls)", rows: [{ athlete_id: "f2" }] as LeaderboardRow[] },
    ];
    const out = buildGenderColumnsFromSections(sections);
    expect(out.boys).toHaveLength(2);
    expect(out.boys[0].title).toBe("Athletes");
    expect(out.boys[1].title).toBe("Alumni");
    expect(out.girls).toHaveLength(2);
    expect(out.girls[0].title).toBe("Athletes");
    expect(out.girls[1].title).toBe("Alumni");
  });

  it("handles empty girls side without affecting boys", () => {
    const male = [{ athlete_id: "m1" }, { athlete_id: "m2" }] as LeaderboardRow[];
    const female: LeaderboardRow[] = [];
    const out = buildGenderColumnModel({ male, female, topN: 10, topNEnabled: true });
    expect(out.male).toHaveLength(2);
    expect(out.female).toHaveLength(0);
  });
});
