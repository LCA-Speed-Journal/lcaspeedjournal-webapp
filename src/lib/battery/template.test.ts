import { describe, expect, it } from "vitest";
import { BATTERY_TEMPLATES, BOYS_BASKETBALL_BASELINE, GIRLS_BASKETBALL_BASELINE, templateForHugoGroup, templateById } from "./template";

describe("BOYS_BASKETBALL_BASELINE", () => {
  it("locks Monday drills and the four ordered testing days", () => {
    expect(BOYS_BASKETBALL_BASELINE.days.map((day) => day.session_date)).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-19",
      "2026-11-20",
    ]);
    expect(BOYS_BASKETBALL_BASELINE.days.map((day) => day.day_key)).toEqual(["A", "B", "C", "D"]);
    expect(BOYS_BASKETBALL_BASELINE.days.map((day) => day.sort_order)).toEqual([1, 2, 3, 4]);
    expect(BOYS_BASKETBALL_BASELINE.days[0].label).toBe("Rate and Reactivity");
    expect(BOYS_BASKETBALL_BASELINE.days[0].metric_keys).toEqual(["10-5_RSI", "40yd_Dash", "DRI"]);
    expect(BOYS_BASKETBALL_BASELINE.days[1].label).toBe("Strength");
    expect(BOYS_BASKETBALL_BASELINE.days[1].metric_keys).toEqual(["Bench-Press", "Hex-Deadlift"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].label).toBe("Power");
    expect(BOYS_BASKETBALL_BASELINE.days[2].metric_keys).toEqual(["Vertical Jump", "Standing-Broad"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].rest_seconds).toBeNull();
    expect(BOYS_BASKETBALL_BASELINE.days[3].label).toBe("Capacity");
    expect(BOYS_BASKETBALL_BASELINE.days[3].metric_keys).toEqual(["10x10m", "OH-MB_Throw"]);
    expect(BOYS_BASKETBALL_BASELINE.days[3].rest_seconds).toBe(10);
    expect(BOYS_BASKETBALL_BASELINE.cutoff_n).toBe(18);
    expect(BOYS_BASKETBALL_BASELINE.senior_grad_year).toBe(2027);
    expect(BOYS_BASKETBALL_BASELINE.comparison_date).toBe("2026-09-02");
  });
});

describe("GIRLS_BASKETBALL_BASELINE", () => {
  it("is one Thursday session for the women's roster", () => {
    expect(GIRLS_BASKETBALL_BASELINE.title).toBe("Girls Basketball Baseline");
    expect(GIRLS_BASKETBALL_BASELINE.hugo_group).toBe("womens_basketball");
    expect(GIRLS_BASKETBALL_BASELINE.cutoff_n).toBe(12);
    expect(GIRLS_BASKETBALL_BASELINE.comparison_date).toBeNull();
    expect(GIRLS_BASKETBALL_BASELINE.days).toEqual([
      {
        day_key: "A",
        label: "Baseline",
        session_date: "2026-11-19",
        sort_order: 1,
        rest_seconds: null,
        metric_keys: ["40yd_Dash", "Vertical Jump", "Standing-Broad", "10-5_RSI", "OH-MB_Throw"],
      },
    ]);
    expect(BATTERY_TEMPLATES.map((item) => item.id)).toContain("girls_basketball_baseline");
    expect(templateById("girls_basketball_baseline")).toBe(GIRLS_BASKETBALL_BASELINE);
    expect(templateForHugoGroup("womens_basketball")).toBe(GIRLS_BASKETBALL_BASELINE);
    expect(templateForHugoGroup("mens_basketball")).toBe(BOYS_BASKETBALL_BASELINE);
    expect(templateById("nope")).toBeNull();
  });
});
