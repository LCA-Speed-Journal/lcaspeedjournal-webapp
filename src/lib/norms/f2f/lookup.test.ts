import { describe, expect, it } from "vitest";
import {
  fitSlowTail,
  interpolatePredicted40,
  type LookupPoint,
} from "./lookup";

const mphLike: LookupPoint[] = [
  { x: 8, y: 4.82 },
  { x: 9, y: 4.64 },
  { x: 10, y: 4.47 },
];

const timeLike: LookupPoint[] = [
  { x: 1.1, y: 4.2 },
  { x: 1.2, y: 4.5 },
  { x: 1.3, y: 4.8 },
  { x: 1.4, y: 5.1 },
  { x: 1.5, y: 5.4 },
];

describe("fitSlowTail", () => {
  it("fits OLS on the slowest third (all 3 when n is 3)", () => {
    const fit = fitSlowTail(mphLike);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(-0.175, 6);
    expect(fit!.intercept).toBeCloseTo(6.218333, 5);
  });

  it("uses the three highest predicted 40s when n is 5", () => {
    const fit = fitSlowTail(timeLike);
    expect(fit!.slope).toBeCloseTo(3, 8);
    expect(fit!.intercept).toBeCloseTo(0.9, 8);
  });

  it("returns null for fewer than two points", () => {
    expect(fitSlowTail([{ x: 1, y: 5 }])).toBeNull();
  });
});

describe("interpolatePredicted40", () => {
  it("returns the exact row", () => {
    expect(interpolatePredicted40(mphLike, 9)).toEqual({
      predicted_40: 4.64,
      extrapolated: false,
    });
  });

  it("interpolates between neighbors", () => {
    const mid = interpolatePredicted40(mphLike, 9.5);
    expect(mid!.extrapolated).toBe(false);
    expect(mid!.predicted_40).toBeCloseTo(4.555, 3);
  });

  it("extrapolates past the slow mph/distance edge and still clamps the fast edge", () => {
    const slow = interpolatePredicted40(mphLike, 7);
    expect(slow!.extrapolated).toBe(true);
    expect(slow!.predicted_40).toBeCloseTo(4.993333, 5);
    expect(slow!.predicted_40).not.toBe(4.82);

    const fast = interpolatePredicted40(mphLike, 11);
    expect(fast!.predicted_40).toBe(4.47);
    expect(fast!.extrapolated).toBe(true);
  });

  it("extrapolates past the slow time edge", () => {
    const hit = interpolatePredicted40(timeLike, 1.6);
    expect(hit!.extrapolated).toBe(true);
    expect(hit!.predicted_40).toBeCloseTo(5.7, 8);
  });

  it("clamps when the tail slope would make a slower mark faster", () => {
    const bent: LookupPoint[] = [
      { x: 1, y: 5.0 },
      { x: 2, y: 5.2 },
      { x: 3, y: 4.0 },
    ];
    const hit = interpolatePredicted40(bent, 0);
    expect(hit!.predicted_40).toBe(5.0);
    expect(hit!.extrapolated).toBe(true);
  });

  it("returns null for a non-finite x or empty table", () => {
    expect(interpolatePredicted40(mphLike, Number.NaN)).toBeNull();
    expect(interpolatePredicted40([], 9)).toBeNull();
  });
});
