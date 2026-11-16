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
});
