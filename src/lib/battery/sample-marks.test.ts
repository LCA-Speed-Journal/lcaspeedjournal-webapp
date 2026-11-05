import { describe, expect, it } from "vitest";
import { sampleMarksForRoster } from "./sample-marks";

const roster = Array.from({ length: 40 }, (_, index) => ({
  athlete_id: `athlete-${index}`,
  first_name: "Test",
  last_name: `Athlete ${index}`,
}));

describe("sampleMarksForRoster", () => {
  it("keeps the same marks for the same athlete", () => {
    const first = sampleMarksForRoster(roster);
    const second = sampleMarksForRoster(roster);
    expect(second.marks).toEqual(first.marks);
    expect([...second.qualifiers.entries()]).toEqual([...first.qualifiers.entries()]);
    expect([...second.dri.entries()]).toEqual([...first.dri.entries()]);
  });

  it("leaves some athletes blank and some tests missing", () => {
    const sample = sampleMarksForRoster(roster);
    const scored = new Set(sample.marks.map((mark) => mark.athlete_id));
    expect(scored.size).toBeGreaterThan(0);
    expect(scored.size).toBeLessThan(roster.length);

    const withTwenty = new Set(
      sample.marks.filter((mark) => mark.key === "20yd_Dash").map((mark) => mark.athlete_id)
    );
    const withForty = new Set(
      sample.marks.filter((mark) => mark.key === "40yd_Dash").map((mark) => mark.athlete_id)
    );
    const missingSplit = [...withForty].filter((id) => !withTwenty.has(id));
    expect(missingSplit.length).toBeGreaterThan(0);

    const skippedBox = [...sample.dri.values()].filter(
      (marks) => !marks.some((mark) => mark.box === "12")
    );
    expect(skippedBox.length).toBeGreaterThan(0);
  });

  it("uses the four RSI notes and keeps DRI inside the boxes we test", () => {
    const sample = sampleMarksForRoster(roster);
    const notes = new Set(sample.qualifiers.values());
    expect(notes).toEqual(new Set(["reactive", "compliant", "stiff", "developing"]));
    for (const marks of sample.dri.values()) {
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        expect(["6", "12", "18", "24"]).toContain(mark.box);
        expect(mark.value).toBeGreaterThan(0);
      }
    }
  });
});
