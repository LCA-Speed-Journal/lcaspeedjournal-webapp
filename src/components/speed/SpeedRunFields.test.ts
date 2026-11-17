import { describe, expect, it } from "vitest";
import { cumulativeTimesForDraft, EMPTY_SPEED_RUN_DRAFT, previewSpeedRun } from "./SpeedRunFields";

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

describe("previewSpeedRun", () => {
  it("returns an error for a trailing pipe in segment mode instead of throwing", () => {
    const result = previewSpeedRun({
      ...EMPTY_SPEED_RUN_DRAFT,
      gatesText: "10, 20",
      timesText: "1.70|",
      timeMode: "segment",
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/segment/i) });
  });
});