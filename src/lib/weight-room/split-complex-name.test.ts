import { describe, it, expect } from "vitest";
import { splitComplexName } from "./split-complex-name";

describe("splitComplexName", () => {
  it("splits spaced slash complexes", () => {
    expect(
      splitComplexName("Recline Sit-Up / Side-Plank / Crawl")
    ).toEqual(["Recline Sit-Up", "Side-Plank", "Crawl"]);
  });

  it("keeps compact slashes as one name", () => {
    expect(splitComplexName("Y's/T's")).toEqual(["Y's/T's"]);
    expect(splitComplexName("A/B")).toEqual(["A/B"]);
  });

  it("returns single name when no complex delimiter", () => {
    expect(splitComplexName("Goblet Squat")).toEqual(["Goblet Squat"]);
  });

  it("returns empty for blank", () => {
    expect(splitComplexName("")).toEqual([]);
    expect(splitComplexName("   ")).toEqual([]);
  });
});
