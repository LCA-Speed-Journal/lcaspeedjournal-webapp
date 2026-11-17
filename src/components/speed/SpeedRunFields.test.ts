import { describe, expect, it } from "vitest";
import { cumulativeTimesForDraft } from "./SpeedRunFields";

describe("cumulativeTimesForDraft", () => {
  it("adds segment times before the run is expanded", () => {
    expect(cumulativeTimesForDraft("1.70|1.15|1.05", "segment")).toEqual([
      "1.7",
      "2.85",
      "3.9",
    ]);
  });

  it("leaves cumulative times unchanged", () => {
    expect(cumulativeTimesForDraft("1.70|2.85|3.90", "cumulative")).toEqual([
      "1.70",
      "2.85",
      "3.90",
    ]);
  });

  it("rejects a blank segment", () => {
    expect(() => cumulativeTimesForDraft("1.70||1.05", "segment")).toThrow(
      /segment/i
    );
  });
});