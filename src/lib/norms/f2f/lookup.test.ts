import { describe, expect, it } from "vitest";
import { interpolatePredicted40, type LookupPoint } from "./lookup";

const points: LookupPoint[] = [
  { x: 8, y: 4.82 },
  { x: 9, y: 4.64 },
  { x: 10, y: 4.47 },
];

describe("interpolatePredicted40", () => {
  it("returns the exact row", () => {
    expect(interpolatePredicted40(points, 9)).toEqual({
      predicted_40: 4.64,
      extrapolated: false,
    });
  });

  it("interpolates between neighbors", () => {
    const mid = interpolatePredicted40(points, 9.5);
    expect(mid.extrapolated).toBe(false);
    expect(mid.predicted_40).toBeCloseTo(4.555, 3);
  });

  it("clamps below/above the table and marks extrapolated", () => {
    expect(interpolatePredicted40(points, 7).predicted_40).toBe(4.82);
    expect(interpolatePredicted40(points, 7).extrapolated).toBe(true);
    expect(interpolatePredicted40(points, 11).predicted_40).toBe(4.47);
    expect(interpolatePredicted40(points, 11).extrapolated).toBe(true);
  });

  it("returns null for a non-finite x or empty table", () => {
    expect(interpolatePredicted40(points, Number.NaN)).toBeNull();
    expect(interpolatePredicted40([], 9)).toBeNull();
  });
});
