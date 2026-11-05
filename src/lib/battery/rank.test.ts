import { describe, expect, it } from "vitest";
import { rankFullField } from "./rank";

describe("rankFullField", () => {
  it("gives first place one point per athlete in the field", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "a", value: 5 },
        { athlete_id: "b", value: 4 },
        { athlete_id: "c", value: 3 },
      ],
      "higher"
    );
    const first = ranked.find((row) => row.athlete_id === "a");
    expect(first).toMatchObject({ rank: 1, tied: false, points: 3 });
  });

  it("shares points on a tie and skips the next place", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "a", value: 10 },
        { athlete_id: "b", value: 10 },
        { athlete_id: "c", value: 8 },
      ],
      "higher"
    );
    expect(ranked.find((row) => row.athlete_id === "a")).toMatchObject({
      rank: 1,
      tied: true,
      points: 2,
    });
    expect(ranked.find((row) => row.athlete_id === "b")).toMatchObject({
      rank: 1,
      tied: true,
      points: 2,
    });
    expect(ranked.find((row) => row.athlete_id === "c")).toMatchObject({
      rank: 3,
      tied: false,
      points: 1,
    });
  });

  it("treats a lower time as better", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "slow", value: 5.2 },
        { athlete_id: "fast", value: 4.8 },
      ],
      "lower"
    );
    expect(ranked.find((row) => row.athlete_id === "fast")?.rank).toBe(1);
    expect(ranked.find((row) => row.athlete_id === "slow")?.points).toBe(1);
  });
});
