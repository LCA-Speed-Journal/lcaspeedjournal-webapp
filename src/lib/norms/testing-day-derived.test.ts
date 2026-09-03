import { describe, it, expect } from "vitest";
import {
  pickBestMaxVelocityHits,
  pickBestTwentyYdHits,
} from "./testing-day-derived";

const base = {
  first_name: "A",
  last_name: "B",
  gender: "M" as const,
};

describe("pickBestTwentyYdHits", () => {
  it("keeps the faster of standalone 20 and 40 0-20 split", () => {
    const hits = pickBestTwentyYdHits([
      {
        ...base,
        athlete_id: "a",
        metric_key: "20yd_Dash",
        component: "0-20yd",
        display_value: 2.9,
      },
      {
        ...base,
        athlete_id: "a",
        metric_key: "40yd_Dash",
        component: "0-20yd",
        display_value: 2.75,
      },
      {
        ...base,
        athlete_id: "b",
        metric_key: "40yd_Dash",
        component: "0-40yd",
        display_value: 5.0,
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ athlete_id: "a", display_value: 2.75 });
  });
});

describe("pickBestMaxVelocityHits", () => {
  it("converts fly splits to mph and keeps the fastest", () => {
    const hits = pickBestMaxVelocityHits([
      {
        ...base,
        athlete_id: "a",
        metric_key: "40yd_Dash",
        component: "20-40yd",
        display_value: 2.0,
      },
      {
        ...base,
        athlete_id: "a",
        metric_key: "20yd_Dash",
        component: "10-20yd",
        display_value: 1.2,
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].athlete_id).toBe("a");
    expect(hits[0].display_value).toBeCloseTo(20.45, 5);
  });
});
