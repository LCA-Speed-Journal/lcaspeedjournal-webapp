import { describe, expect, it } from "vitest";
import { f2fChipLabel, formatQualityMark, f2fShowsPredicted40s } from "./labels";
import type { F2fProfile } from "./types";

const baseProfile: F2fProfile = {
  reference_40: 5.2,
  reference_source: "actual_40",
  explosion: null,
  force: null,
  form: null,
  eligible_for_labels: true,
  show_predicted_40s: false,
  flags: ["force"],
  primary: "force",
};

describe("f2fChipLabel", () => {
  it("labels qualities as deficient and leaves Balanced intact", () => {
    expect(f2fChipLabel("force")).toBe("Force-deficient");
    expect(f2fChipLabel("explosion")).toBe("Explosion-deficient");
    expect(f2fChipLabel("form")).toBe("Form-deficient");
    expect(f2fChipLabel("balanced")).toBe("Balanced");
  });
});

describe("formatQualityMark", () => {
  it("appends session_date only when the profile is composed", () => {
    const vertex = {
      predicted_40: 4.93,
      extrapolated: false,
      projected: false,
      session_date: "2026-04-20",
    };
    expect(formatQualityMark(vertex, true)).toBe("4.93 · 2026-04-20");
    expect(formatQualityMark(vertex, false)).toBe("4.93");
  });
});

describe("f2fShowsPredicted40s", () => {
  it("is true only when the profile opts in", () => {
    expect(f2fShowsPredicted40s(baseProfile)).toBe(false);
    expect(
      f2fShowsPredicted40s({ ...baseProfile, show_predicted_40s: true })
    ).toBe(true);
    expect(f2fShowsPredicted40s(null)).toBe(false);
  });
});
