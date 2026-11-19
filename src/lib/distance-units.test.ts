import { describe, expect, it } from "vitest";
import { formatFeetInches } from "./distance-units";

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
});
