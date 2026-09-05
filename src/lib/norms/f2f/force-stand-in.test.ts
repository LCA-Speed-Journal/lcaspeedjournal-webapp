import { describe, expect, it } from "vitest";
import { isForceStandIn } from "./force-stand-in";

describe("isForceStandIn", () => {
  it("accepts 0-20yd on either 20yd or 40yd dash", () => {
    expect(
      isForceStandIn({ metric_key: "20yd_Dash", component: "0-20yd" })
    ).toBe(true);
    expect(
      isForceStandIn({ metric_key: "40yd_Dash", component: "0-20yd" })
    ).toBe(true);
    expect(
      isForceStandIn({ metric_key: "20yd_Dash", component: "0-20" })
    ).toBe(true);
  });

  it("rejects other splits and metrics", () => {
    expect(
      isForceStandIn({ metric_key: "40yd_Dash", component: "5-10yd" })
    ).toBe(false);
    expect(
      isForceStandIn({ metric_key: "Standing-Broad", component: "0-20yd" })
    ).toBe(false);
  });
});
