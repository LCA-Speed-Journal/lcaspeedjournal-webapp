import { describe, expect, it } from "vitest";
import { sampleMarksForRoster } from "./sample-marks";
import { applySampleOverrides, clearSampleOverrides, writeSampleOverride } from "./sample-overrides";

const batteryId = "battery-sample-overrides";

describe("applySampleOverrides", () => {
  it("replaces one generated mark and can blank it", () => {
    clearSampleOverrides(batteryId);
    const athletes = [{ athlete_id: "a", first_name: "Ann", last_name: "Able" }];
    const generated = sampleMarksForRoster(athletes);
    const before = generated.marks.find((mark) => mark.key === "40yd_Dash")?.value;
    writeSampleOverride(batteryId, "a", "40yd_Dash", 4.4);
    const replaced = applySampleOverrides(batteryId, generated);
    expect(replaced.marks.find((mark) => mark.key === "40yd_Dash")?.value).toBe(4.4);
    expect(replaced.marks.find((mark) => mark.key === "40yd_Dash")?.value).not.toBe(before);

    writeSampleOverride(batteryId, "a", "40yd_Dash", null);
    const blank = applySampleOverrides(batteryId, generated);
    expect(blank.marks.some((mark) => mark.key === "40yd_Dash")).toBe(false);
    clearSampleOverrides(batteryId);
  });

  it("edits the 12in DRI box that the board scores", () => {
    clearSampleOverrides(batteryId);
    const generated = sampleMarksForRoster([
      { athlete_id: "a", first_name: "Ann", last_name: "Able" },
    ]);
    writeSampleOverride(batteryId, "a", "DRI", 2.22);
    const next = applySampleOverrides(batteryId, generated);
    expect(next.dri.get("a")?.find((mark) => mark.box === "12")?.value).toBe(2.22);
    clearSampleOverrides(batteryId);
  });
});
