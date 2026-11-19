import { describe, expect, it } from "vitest";
import { formatFeetInches, parseDistanceMagnitude } from "./distance-units";

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
