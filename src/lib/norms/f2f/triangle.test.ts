import { describe, expect, it } from "vitest";
import { vertexRadius } from "./triangle";

describe("vertexRadius", () => {
  it("is 0.5 when predicted equals the reference", () => {
    expect(vertexRadius(5, 5)).toBe(0.5);
  });

  it("is 0 when predicted is 12.5% slower than the reference", () => {
    expect(vertexRadius(5 * 1.125, 5)).toBe(0);
  });

  it("is 1 when predicted is 12.5% faster than the reference", () => {
    expect(vertexRadius(5 * 0.875, 5)).toBe(1);
  });

  it("clamps to 0 when predicted is much slower than +12.5%", () => {
    expect(vertexRadius(8, 5)).toBe(0);
  });

  it("clamps to 1 when predicted is much faster than -12.5%", () => {
    expect(vertexRadius(3, 5)).toBe(1);
  });

  it("returns 0 for non-finite inputs or a non-positive reference", () => {
    expect(vertexRadius(Number.NaN, 5)).toBe(0);
    expect(vertexRadius(5, Number.POSITIVE_INFINITY)).toBe(0);
    expect(vertexRadius(5, 0)).toBe(0);
    expect(vertexRadius(5, -4)).toBe(0);
  });
});
