import { describe, expect, it } from "vitest";
import { BOYS_BASKETBALL_BASELINE } from "./template";

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
    expect(BOYS_BASKETBALL_BASELINE.days[1].label).toBe("Upper Body");
    expect(BOYS_BASKETBALL_BASELINE.days[1].metric_keys).toEqual(["OH-MB_Throw", "Bench-Press"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].label).toBe("Power");
    expect(BOYS_BASKETBALL_BASELINE.days[2].metric_keys).toEqual(["Vertical Jump", "Standing-Broad"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].rest_seconds).toBeNull();
    expect(BOYS_BASKETBALL_BASELINE.days[3].label).toBe("Capacity");
    expect(BOYS_BASKETBALL_BASELINE.days[3].metric_keys).toEqual(["10x10m", "Hex-Deadlift"]);
    expect(BOYS_BASKETBALL_BASELINE.days[3].rest_seconds).toBe(10);
    expect(BOYS_BASKETBALL_BASELINE.cutoff_n).toBe(18);
    expect(BOYS_BASKETBALL_BASELINE.senior_grad_year).toBe(2027);
    expect(BOYS_BASKETBALL_BASELINE.comparison_date).toBe("2026-09-02");
  });
});
