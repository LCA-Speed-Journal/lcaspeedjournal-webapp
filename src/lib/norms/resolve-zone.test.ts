import { describe, it, expect } from "vitest";
import { resolveZone } from "./resolve-zone";
import type { ZoneCut } from "./resolve-zone";

const vj: ZoneCut[] = [
  { label: "efficient", threshold: 20 },
  { label: "elite", threshold: 28 },
];

const forty: ZoneCut[] = [
  { label: "efficient", threshold: 5.0 },
  { label: "elite", threshold: 4.5 },
];

describe("resolveZone higher-is-better", () => {
  it("returns null below the easiest cut", () => {
    expect(resolveZone({ value: 18, lowerIsBetter: false, cuts: vj })).toBeNull();
  });

  it("returns efficient between cuts", () => {
    expect(resolveZone({ value: 22, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "efficient"
    );
  });

  it("returns elite at or above elite", () => {
    expect(resolveZone({ value: 28, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "elite"
    );
    expect(resolveZone({ value: 30, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "elite"
    );
  });

  it("does not require poor to be filled", () => {
    expect(resolveZone({ value: 22, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "efficient"
    );
  });
});

describe("resolveZone lower-is-better", () => {
  it("returns null slower than the easiest cut", () => {
    expect(resolveZone({ value: 5.2, lowerIsBetter: true, cuts: forty })).toBeNull();
  });

  it("returns efficient at 5.0 and elite at 4.5", () => {
    expect(resolveZone({ value: 4.9, lowerIsBetter: true, cuts: forty })?.label).toBe(
      "efficient"
    );
    expect(resolveZone({ value: 4.5, lowerIsBetter: true, cuts: forty })?.label).toBe(
      "elite"
    );
    expect(resolveZone({ value: 4.4, lowerIsBetter: true, cuts: forty })?.label).toBe(
      "elite"
    );
  });
});

describe("resolveZone edges", () => {
  it("returns null for empty cuts or non-finite value", () => {
    expect(resolveZone({ value: 22, lowerIsBetter: false, cuts: [] })).toBeNull();
    expect(
      resolveZone({ value: Number.NaN, lowerIsBetter: false, cuts: vj })
    ).toBeNull();
  });

  it("includes color on a hit", () => {
    const z = resolveZone({ value: 22, lowerIsBetter: false, cuts: vj });
    expect(z?.color).toBe("#ca8a04");
  });
});
