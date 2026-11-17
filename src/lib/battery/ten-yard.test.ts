import { describe, expect, it } from "vitest";
import { bestTenYardMarks } from "./ten-yard";

describe("bestTenYardMarks", () => {
  it("keeps the fastest 0-10 and ignores the 0-20 and 0-40 rows", () => {
    const marks = bestTenYardMarks([
      { athlete_id: "a", metric_key: "40yd_Dash", component: "0-10yd", display_value: 1.8 },
      { athlete_id: "a", metric_key: "40yd_Dash", component: "0-10yd", display_value: 1.7 },
      { athlete_id: "a", metric_key: "40yd_Dash", component: "0-20yd", display_value: 2.9 },
      { athlete_id: "a", metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.1 },
      { athlete_id: "b", metric_key: "40yd_Dash", component: "0-10yd", display_value: 1.9 },
    ]);
    expect(marks).toEqual([
      { athlete_id: "a", key: "10yd_Split", value: 1.7 },
      { athlete_id: "b", key: "10yd_Split", value: 1.9 },
    ]);
  });
});
