import { describe, expect, it } from "vitest";
import { f2fChipLabel, formatQualityMark } from "./labels";

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
