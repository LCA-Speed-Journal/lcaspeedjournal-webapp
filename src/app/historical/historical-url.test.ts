import { describe, expect, it } from "vitest";
import { buildHistoricalLeaderboardUrl } from "./historical-url";

describe("buildHistoricalLeaderboardUrl", () => {
  it("returns null until from, to, and metric are set", () => {
    expect(
      buildHistoricalLeaderboardUrl({ from: "", to: "2026-08-31", metric: "Vertical Jump" })
    ).toBeNull();
    expect(
      buildHistoricalLeaderboardUrl({ from: "2026-01-01", to: "", metric: "Vertical Jump" })
    ).toBeNull();
    expect(
      buildHistoricalLeaderboardUrl({ from: "2026-01-01", to: "2026-08-31", metric: "" })
    ).toBeNull();
  });

  it("omits population_id when the override is blank", () => {
    expect(
      buildHistoricalLeaderboardUrl({
        from: "2026-01-01",
        to: "2026-08-31",
        metric: "Vertical Jump",
      })
    ).toBe(
      "/api/leaderboard/historical?from=2026-01-01&to=2026-08-31&metric=Vertical%20Jump"
    );
  });

  it("appends population_id, phase, and group_by when set", () => {
    expect(
      buildHistoricalLeaderboardUrl({
        from: "2026-01-01",
        to: "2026-08-31",
        metric: "40yd_Dash",
        phase: "Off-Season",
        groupByGender: true,
        populationId: "22222222-2222-4222-8222-222222222222",
      })
    ).toBe(
      "/api/leaderboard/historical?from=2026-01-01&to=2026-08-31&metric=40yd_Dash&phase=Off-Season&group_by=gender&population_id=22222222-2222-4222-8222-222222222222"
    );
  });
});
