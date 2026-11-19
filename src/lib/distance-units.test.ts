import { describe, expect, it } from "vitest";
import {
  defaultDistanceUnit,
  formatFeetInches,
  parseDistanceMagnitude,
  storedDistance,
} from "./distance-units";

describe("formatFeetInches", () => {
  it("prints a whole inch without a decimal", () => {
    expect(formatFeetInches(6.5)).toBe("6' 6\"");
  });

  it("keeps a tenth of an inch", () => {
    expect(formatFeetInches(6 + 7.5 / 12)).toBe("6' 7.5\"");
  });

  it("carries 10.8 inches from 6.9 feet", () => {
    expect(formatFeetInches(6.9)).toBe("6' 10.8\"");
  });

  it("rolls 12 inches into the next foot", () => {
    expect(formatFeetInches(6 + 11.96 / 12)).toBe("7' 0\"");
  });

  it("prints zero feet and a whole foot with zero inches", () => {
    expect(formatFeetInches(0)).toBe("0' 0\"");
    expect(formatFeetInches(7)).toBe("7' 0\"");
    expect(formatFeetInches(0.5)).toBe("0' 6\"");
  });
});

describe("parseDistanceMagnitude", () => {
  it("reads feet-inches spellings as decimal feet", () => {
    const samples = ["6-6", "6' 6\"", "6'6\"", "6ft 6", "6ft 6in", "6ft 6.5in"];
    const feet = samples.map((raw) => parseDistanceMagnitude(raw, "ft_in"));
    expect(feet.slice(0, 5).every((n) => Math.abs(n - 6.5) < 1e-9)).toBe(true);
    expect(feet[5]).toBeCloseTo(6 + 6.5 / 12, 6);
  });

  it("reads a bare number under feet-inches as decimal feet", () => {
    expect(parseDistanceMagnitude("45", "ft_in")).toBe(45);
    expect(parseDistanceMagnitude("39.5", "ft_in")).toBe(39.5);
  });

  it("reads inches, centimeters, and meters", () => {
    expect(parseDistanceMagnitude("34.5\"", "in")).toBe(34.5);
    expect(parseDistanceMagnitude("34.5in", "in")).toBe(34.5);
    expect(parseDistanceMagnitude("200cm", "cm")).toBe(200);
    expect(parseDistanceMagnitude("2.05m", "m")).toBe(2.05);
  });

  it("rejects a unit suffix that disagrees with the toggle", () => {
    expect(() => parseDistanceMagnitude("200cm", "ft_in")).toThrow(/unit/i);
    expect(() => parseDistanceMagnitude("6-6", "cm")).toThrow(/unit/i);
  });
});

describe("defaultDistanceUnit", () => {
  it("maps a feet metric to the feet-inches toggle", () => {
    expect(defaultDistanceUnit("ft")).toBe("ft_in");
    expect(defaultDistanceUnit("cm")).toBe("cm");
    expect(defaultDistanceUnit("m")).toBe("m");
    expect(defaultDistanceUnit("in")).toBe("in");
    expect(defaultDistanceUnit("inches")).toBe("in");
    expect(defaultDistanceUnit("s")).toBeNull();
  });
});

describe("storedDistance", () => {
  it("keeps a feet-inches jump in decimal feet", () => {
    const stored = storedDistance({
      raw: "6-6",
      measuredUnit: "ft_in",
      inputUnits: "ft",
      displayUnits: "ft",
    });
    expect(stored.value).toBeCloseTo(6.5, 5);
    expect(stored.displayValue).toBeCloseTo(6.5, 5);
    expect(stored.units).toBe("ft");
  });

  it("converts centimeters into feet for a jump", () => {
    const stored = storedDistance({
      raw: "198.12",
      measuredUnit: "cm",
      inputUnits: "ft",
      displayUnits: "ft",
    });
    expect(stored.displayValue).toBeCloseTo(6.5, 2);
    expect(stored.value).toBeCloseTo(6.5, 2);
  });

  it("stores a bound in meters and displays feet", () => {
    const stored = storedDistance({
      raw: "12.5",
      measuredUnit: "m",
      inputUnits: "m",
      displayUnits: "ft",
    });
    expect(stored.value).toBe(12.5);
    expect(stored.displayValue).toBeCloseTo(12.5 * 3.281, 5);
    expect(stored.units).toBe("ft");
  });

  it("stores a vertical entered in centimeters as inches", () => {
    const stored = storedDistance({
      raw: "76.2",
      measuredUnit: "cm",
      inputUnits: "in",
      displayUnits: "in",
    });
    expect(stored.displayValue).toBeCloseTo(30, 2);
    expect(stored.value).toBeCloseTo(30, 2);
    expect(stored.units).toBe("in");
  });
});
