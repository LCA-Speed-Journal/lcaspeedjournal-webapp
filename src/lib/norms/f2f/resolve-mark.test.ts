import { describe, expect, it } from "vitest";
import { mphFromYardSplit } from "../forty-yd";
import { resolveExplosion, resolveForce, resolveForm } from "./resolve-mark";

describe("resolveExplosion", () => {
  it("looks up standing broad jump in feet", () => {
    const hit = resolveExplosion(9);
    expect(hit?.predicted_40).toBeCloseTo(4.64, 2);
    expect(hit?.extrapolated).toBe(false);
  });
});

describe("resolveForce", () => {
  it("uses the 5-15 table for a 10-yard fly time", () => {
    const hit = resolveForce({ timeS: 1.25, yards: 10 });
    expect(hit?.predicted_40).toBeCloseTo(4.93, 2);
  });

  it("bridges a journal 5-10yd (5-yard) split via mph", () => {
    const mph = mphFromYardSplit(0.7, 5);
    expect(mph).not.toBeNull();
    const fromTime = resolveForce({ timeS: 0.7, yards: 5 });
    const fromMph = resolveForce({ mph: mph! });
    expect(fromTime?.predicted_40).toBeCloseTo(fromMph!.predicted_40, 4);
  });
});

describe("resolveForm", () => {
  it("prefers the 20-40 table when the split is 20-40yd", () => {
    const hit = resolveForm({ component: "20-40yd", timeS: 2.045, yards: 20 });
    expect(hit?.predicted_40).toBeCloseTo(4.9, 2);
    expect(hit?.table).toBe("20-40yd");
  });

  it("uses mph on the Form curve for a 10-20yd proxy", () => {
    const mph = mphFromYardSplit(1.136111111, 10);
    const hit = resolveForm({ component: "10-20yd", mph: mph! });
    expect(hit?.predicted_40).toBeGreaterThan(5);
    expect(hit?.table).not.toBe("20-40yd");
  });
});
