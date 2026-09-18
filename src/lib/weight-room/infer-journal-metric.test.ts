import { describe, it, expect } from "vitest";
import { inferSpeedJournalMetricKey } from "./infer-journal-metric";

describe("inferSpeedJournalMetricKey", () => {
  it("maps standing broad jump names", () => {
    expect(inferSpeedJournalMetricKey("Standing Broad Jump")).toBe(
      "Standing-Broad"
    );
    expect(inferSpeedJournalMetricKey("Standing Broad Jump — Retest")).toBe(
      "Standing-Broad"
    );
    expect(inferSpeedJournalMetricKey("Broad Jump")).toBe("Standing-Broad");
  });

  it("skips submax broad / CMJ", () => {
    expect(inferSpeedJournalMetricKey("Standing Broad Jump — Submax")).toBeNull();
    expect(inferSpeedJournalMetricKey("CMJ — Submax")).toBeNull();
  });

  it("maps CMJ / vertical jump", () => {
    expect(inferSpeedJournalMetricKey("Jump-Mat: CMJ")).toBe("Vertical Jump");
    expect(inferSpeedJournalMetricKey("CMJ")).toBe("Vertical Jump");
  });

  it("leaves ordinary lifts unmapped", () => {
    expect(inferSpeedJournalMetricKey("Back Squat")).toBeNull();
    expect(inferSpeedJournalMetricKey("DB Bench")).toBeNull();
  });
});
