import { describe, expect, it } from "vitest";
import { rsqQuadrant } from "./rsq";

describe("rsqQuadrant", () => {
  it("puts the crosshair in Compliant and the upper left in Reactive", () => {
    expect(rsqQuadrant(10, 200)).toBe("compliant");
    expect(rsqQuadrant(12, 180)).toBe("reactive");
    expect(rsqQuadrant(8, 180)).toBe("stiff");
    expect(rsqQuadrant(8, 250)).toBe("developing");
  });
});
