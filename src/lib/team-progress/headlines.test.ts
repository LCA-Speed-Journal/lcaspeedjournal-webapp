import { describe, expect, it } from "vitest";
import {
  CORE_TEST_KEYS,
  EXTRA_TESTS_BY_GROUP,
  ISO_ROCKS,
  LIFT_PATTERNS,
  classifyLiftName,
  displayedTestKeys,
  matchIsoRock,
} from "./headlines";
import {
  hugoSeasonRange,
  lastNDaysRange,
  schoolYearRange,
} from "./date-presets";
import {
  firstLastEligible,
  improvedPct,
  median,
  metricDelta,
} from "./stats";

describe("headlines registry", () => {
  it("lists the five core tests including OH-MB_Throw and excluding 5-10-5", () => {
    expect(CORE_TEST_KEYS).toEqual([
      "40yd_Dash",
      "MaxVelocity",
      "Standing-Broad",
      "Vertical Jump",
      "OH-MB_Throw",
    ]);
    expect(CORE_TEST_KEYS).not.toContain("5-10-5_Agility");
  });

  it("adds RSI for volleyball and 5-10-5 for soccer groups", () => {
    expect(EXTRA_TESTS_BY_GROUP.volleyball).toEqual(["10-5_RSI"]);
    expect(EXTRA_TESTS_BY_GROUP.soccer).toEqual(["5-10-5_Agility"]);
    expect(EXTRA_TESTS_BY_GROUP.womens_soccer).toEqual(["5-10-5_Agility"]);
    expect(displayedTestKeys("volleyball", [])).toEqual([
      ...CORE_TEST_KEYS,
      "10-5_RSI",
    ]);
    expect(displayedTestKeys("football", ["UH-MB_Throw"])).toEqual([
      ...CORE_TEST_KEYS,
      "UH-MB_Throw",
    ]);
  });

  it("classifies squat / press / hinge aliases and ignores trap-bar", () => {
    expect(classifyLiftName("Tempo Goblet Squat")).toBe("squat");
    expect(classifyLiftName("Front Squat")).toBe("squat");
    expect(classifyLiftName("DB Bench (3RM Test)")).toBe("press");
    expect(classifyLiftName("Overhead Press")).toBe("press");
    expect(classifyLiftName("BB RDL (3RM Test)")).toBe("hinge");
    expect(classifyLiftName("Romanian Deadlift")).toBe("hinge");
    expect(classifyLiftName("Trap-Bar Deadlift")).toBeNull();
    expect(LIFT_PATTERNS.map((p) => p.id)).toEqual(["squat", "press", "hinge"]);
  });

  it("matches ISO rock names and notes", () => {
    expect(matchIsoRock("Split-Squat ISO")).toBe("iso_lunge");
    expect(matchIsoRock("lunge ISO acc. 60s/leg")).toBe("iso_lunge");
    expect(matchIsoRock("Spring ankle (bent-knee) 45s/leg")).toBe("spring_ankle");
    expect(matchIsoRock("Sprinter Bridge")).toBe("sprinter_bridge");
    expect(matchIsoRock("Copenhagen Side-Plank")).toBe("copenhagen");
    expect(ISO_ROCKS.map((r) => r.id)).toEqual([
      "iso_lunge",
      "spring_ankle",
      "sprinter_bridge",
      "copenhagen",
    ]);
  });
});

describe("date presets", () => {
  it("returns Hugo season windows for fall / winter / spring / year", () => {
    expect(hugoSeasonRange("fall", 2026)).toEqual({
      from: "2026-08-01",
      to: "2026-11-30",
    });
    expect(hugoSeasonRange("winter", 2026)).toEqual({
      from: "2025-11-15",
      to: "2026-03-15",
    });
    expect(hugoSeasonRange("spring", 2026)).toEqual({
      from: "2026-03-01",
      to: "2026-06-15",
    });
    expect(hugoSeasonRange("year", 2026)).toEqual({
      from: "2025-08-01",
      to: "2026-07-31",
    });
  });

  it("returns school year and last-N-days ranges", () => {
    expect(schoolYearRange(new Date("2026-09-15T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-07-31",
    });
    expect(schoolYearRange(new Date("2026-01-10T12:00:00Z"))).toEqual({
      from: "2025-08-01",
      to: "2026-07-31",
    });
    expect(lastNDaysRange(new Date("2026-09-15T12:00:00Z"), 90)).toEqual({
      from: "2026-06-18",
      to: "2026-09-15",
    });
  });
});

describe("stats helpers", () => {
  it("computes median for odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("computes metric deltas with lower-is-better for time", () => {
    expect(metricDelta(5.1, 4.9, true)).toBeCloseTo(-0.2);
    expect(metricDelta(20, 24, false)).toBe(4);
    expect(metricDelta(null, 4.9, true)).toBeNull();
  });

  it("picks first/last points with n >= minN and improved pct", () => {
    const points = [
      { date: "2026-08-01", median: 5.2, n: 2 },
      { date: "2026-09-01", median: 5.1, n: 5 },
      { date: "2026-10-01", median: 4.95, n: 6 },
      { date: "2026-11-01", median: 4.9, n: 1 },
    ];
    expect(firstLastEligible(points, 3)).toEqual({
      first: { date: "2026-09-01", median: 5.1, n: 5 },
      last: { date: "2026-10-01", median: 4.95, n: 6 },
    });
    expect(
      improvedPct(
        [
          { first: 5.2, last: 5.0 },
          { first: 5.1, last: 5.15 },
          { first: 5.0, last: 4.8 },
        ],
        true
      )
    ).toBeCloseTo(2 / 3);
    expect(improvedPct([], true)).toBeNull();
  });
});
