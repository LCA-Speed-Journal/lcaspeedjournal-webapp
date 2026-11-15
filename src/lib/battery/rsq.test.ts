import { describe, expect, it } from "vitest";
import { rsqPoint, rsqQuadrant } from "./rsq";

describe("rsqQuadrant", () => {
  it("puts the crosshair in Compliant and the upper left in Reactive", () => {
    expect(rsqQuadrant(10, 200)).toBe("compliant");
    expect(rsqQuadrant(12, 180)).toBe("reactive");
    expect(rsqQuadrant(8, 180)).toBe("stiff");
    expect(rsqQuadrant(8, 250)).toBe("developing");
  });
});

describe("rsqPoint", () => {
  it("maps 10 inches and 200 ms to the middle of the plot", () => {
    expect(rsqPoint(10, 200)).toEqual({ x: 0.5, y: 0.5 });
    expect(rsqPoint(20, 0).y).toBe(0);
    expect(rsqPoint(0, 400).x).toBe(1);
  });
});
