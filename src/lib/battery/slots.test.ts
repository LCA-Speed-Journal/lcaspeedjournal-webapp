import { describe, expect, it } from "vitest";
import { batteryTotal, COUNTED_SLOT_COUNT } from "./slots";

describe("batteryTotal", () => {
  it("averages the three sprint columns into one slot", () => {
    const total = batteryTotal({
      "10-5_RSI": 30,
      "20yd_Dash": 20,
      "40yd_Dash": 10,
      MaxVelocity: 30,
      DRI: 15,
    });
    expect(COUNTED_SLOT_COUNT).toBe(9);
    expect(total.sprint_points).toBe(20);
    expect(total.total_points).toBe(65);
    expect(total.slots_completed).toBe(3);
  });

  it("leaves a missing sprint column out of the average", () => {
    const total = batteryTotal({
      "40yd_Dash": 10,
      "Vertical Jump": 8,
    });
    expect(total.sprint_points).toBe(10);
    expect(total.total_points).toBe(18);
    expect(total.slots_completed).toBe(2);
  });

  it("counts each 10x10 quality as its own slot", () => {
    const total = batteryTotal({
      "10x10m_best": 4,
      "10x10m_mean": 5,
      "10x10m_decrement": 6,
    });
    expect(total.total_points).toBe(15);
    expect(total.slots_completed).toBe(3);
  });
});
