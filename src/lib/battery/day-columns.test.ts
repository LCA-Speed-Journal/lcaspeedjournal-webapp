import { describe, expect, it } from "vitest";
import { orderDayColumnKeys } from "./day-columns";

describe("orderDayColumnKeys", () => {
  it("puts the 40-yard splits ahead of RSI and DRI on day A", () => {
    expect(
      orderDayColumnKeys("A", ["10-5_RSI", "20yd_Dash", "40yd_Dash", "MaxVelocity", "DRI"])
    ).toEqual(["20yd_Dash", "40yd_Dash", "MaxVelocity", "10-5_RSI", "DRI"]);
  });

  it("leaves other days in the order they were given", () => {
    expect(orderDayColumnKeys("B", ["OH-MB_Throw", "Bench-Press"])).toEqual([
      "OH-MB_Throw",
      "Bench-Press",
    ]);
  });

  it("leaves a day A that is not the boys reactivity set in the order it was given", () => {
    expect(
      orderDayColumnKeys("A", [
        "20yd_Dash",
        "40yd_Dash",
        "MaxVelocity",
        "Vertical Jump",
        "Standing-Broad",
        "10-5_RSI",
        "OH-MB_Throw",
      ])
    ).toEqual([
      "20yd_Dash",
      "40yd_Dash",
      "MaxVelocity",
      "Vertical Jump",
      "Standing-Broad",
      "10-5_RSI",
      "OH-MB_Throw",
    ]);
  });
});
