import { describe, expect, it } from "vitest";
import { formatWindowMetric, parseWindowMetric } from "./window-metric";

describe("parseWindowMetric", () => {
  it("round-trips an acceleration and a build-in", () => {
    expect(parseWindowMetric(formatWindowMetric("Acceleration", "0-10yd"))).toEqual({
      metric_key: "Acceleration",
      component: "0-10yd",
    });
    expect(parseWindowMetric(formatWindowMetric("BuildIn", "10-20yd"))).toEqual({
      metric_key: "BuildIn",
      component: "10-20yd",
    });
  });

  it("returns null for Max Velocity and for junk", () => {
    expect(parseWindowMetric("MaxVelocity")).toBeNull();
    expect(parseWindowMetric("window:Jump:0-10yd")).toBeNull();
  });
});
