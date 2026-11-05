import { describe, expect, it } from "vitest";
import { BOYS_BASKETBALL_BASELINE } from "./template";

describe("BOYS_BASKETBALL_BASELINE", () => {
  it("puts DRI on Monday and leaves Friday as the 10x10", () => {
    expect(BOYS_BASKETBALL_BASELINE.days.map((day) => day.session_date)).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
    const monday = BOYS_BASKETBALL_BASELINE.days[0];
    expect(monday.metric_keys).toEqual(["10-5_RSI", "40yd_Dash", "DRI"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].metric_keys).toEqual(["10x10m"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].rest_seconds).toBe(10);
    expect(BOYS_BASKETBALL_BASELINE.cutoff_n).toBe(18);
    expect(BOYS_BASKETBALL_BASELINE.senior_grad_year).toBe(2027);
    expect(BOYS_BASKETBALL_BASELINE.comparison_date).toBe("2026-09-02");
  });
});
