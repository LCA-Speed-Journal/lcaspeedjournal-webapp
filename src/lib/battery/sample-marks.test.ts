import { describe, expect, it } from "vitest";
import { rsqQuadrant } from "./rsq";
import { SAMPLE_EDIT_KEYS } from "./sample-overrides";
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

  it("gives each tested athlete jump and contact time, and a qualifier from those two", () => {
    const sample = sampleMarksForRoster(roster);
    const tested = [
      ...new Set(sample.marks.filter((mark) => mark.key === "10-5_RSI").map((mark) => mark.athlete_id)),
    ];
    expect(tested.length).toBeGreaterThan(8);

    const value = (athleteId: string, key: string) =>
      sample.marks.find((mark) => mark.athlete_id === athleteId && mark.key === key)?.value;

    for (const athleteId of tested) {
      const jump = value(athleteId, "10-5_JH");
      const contact = value(athleteId, "10-5_GCT");
      expect(jump).toBeGreaterThanOrEqual(6);
      expect(jump).toBeLessThanOrEqual(20);
      expect(contact).toBeGreaterThanOrEqual(140);
      expect(contact).toBeLessThanOrEqual(320);
      expect(sample.qualifiers.get(athleteId)).toBe(rsqQuadrant(jump ?? 0, contact ?? 0));
    }
  });

  it("fills bench and hex for most tested athletes and leaves a hash-based blank lift", () => {
    const sample = sampleMarksForRoster(roster);
    const tested = [
      ...new Set(sample.marks.filter((mark) => mark.key === "10-5_RSI").map((mark) => mark.athlete_id)),
    ];
    const has = (athleteId: string, key: string) =>
      sample.marks.some((mark) => mark.athlete_id === athleteId && mark.key === key);

    const withBench = tested.filter((athleteId) => has(athleteId, "Bench-Press"));
    const withHex = tested.filter((athleteId) => has(athleteId, "Hex-Deadlift"));
    const withBoth = tested.filter(
      (athleteId) => has(athleteId, "Bench-Press") && has(athleteId, "Hex-Deadlift")
    );

    expect(withBench.length).toBeGreaterThan(0);
    expect(withHex.length).toBeGreaterThan(0);
    expect(withBoth.length).toBeLessThan(tested.length);

    for (const athleteId of withBench) {
      const pounds = sample.marks.find(
        (mark) => mark.athlete_id === athleteId && mark.key === "Bench-Press"
      )?.value;
      expect(pounds).toBeGreaterThanOrEqual(95);
      expect(pounds).toBeLessThanOrEqual(225);
    }
    for (const athleteId of withHex) {
      const pounds = sample.marks.find(
        (mark) => mark.athlete_id === athleteId && mark.key === "Hex-Deadlift"
      )?.value;
      expect(pounds).toBeGreaterThanOrEqual(135);
      expect(pounds).toBeLessThanOrEqual(315);
    }
  });

  it("lets a coach edit jump, contact, bench, and hex on the sample board", () => {
    expect(SAMPLE_EDIT_KEYS).toEqual(expect.arrayContaining([
      "10-5_JH",
      "10-5_GCT",
      "Bench-Press",
      "Hex-Deadlift",
    ]));
  });
});
