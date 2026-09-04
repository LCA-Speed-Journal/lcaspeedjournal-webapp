import { describe, expect, it } from "vitest";
import { buildF2fThemes, formatMixCounts, themeGroupKey } from "./themes";
import type { F2fThemeAthlete } from "./themes";

function athlete(partial: Partial<F2fThemeAthlete> & { id: string }): F2fThemeAthlete {
  return {
    first_name: "A",
    last_name: partial.id,
    sport: "soccer",
    gender: "M",
    eligible_for_labels: true,
    primary: "force",
    reference_40: 5,
    ...partial,
  };
}

describe("buildF2fThemes", () => {
  it("does not invert a Force deficiency into a strength for a 1-athlete group", () => {
    const themes = buildF2fThemes([
      athlete({ id: "1", primary: "force", reference_40: 5.1 }),
    ]);
    const note = themes.groups[0].generated_note;
    expect(note).toContain("Force-deficient");
    expect(note).not.toContain("Force-strong");
    expect(note).not.toContain("Top 5 are Force");
  });

  it("reports roster mix and contrasts top 5 vs the rest", () => {
    const athletes = [
      athlete({ id: "1", primary: "form", reference_40: 4.6 }),
      athlete({ id: "2", primary: "form", reference_40: 4.7 }),
      athlete({ id: "3", primary: "form", reference_40: 4.8 }),
      athlete({ id: "4", primary: "balanced", reference_40: 4.9 }),
      athlete({ id: "5", primary: "balanced", reference_40: 5.0 }),
      athlete({ id: "6", primary: "force", reference_40: 5.1 }),
      athlete({ id: "7", primary: "force", reference_40: 5.2 }),
      athlete({ id: "8", primary: "force", reference_40: 5.3 }),
      athlete({ id: "g", gender: "F", eligible_for_labels: false, primary: null, reference_40: 4.5 }),
    ];
    const themes = buildF2fThemes(athletes);
    const soccerM = themes.groups.find(
      (g) => g.sport === "soccer" && g.gender === "M"
    );
    expect(soccerM?.eligible_count).toBe(8);
    expect(soccerM?.mix.force).toBe(3);
    expect(soccerM?.top5_mix.form).toBe(3);
    expect(soccerM?.rest_mix?.force).toBe(3);
    expect(soccerM?.generated_note).toContain("Force-deficient");
    expect(soccerM?.generated_note).not.toContain("Form-strong");
    expect(soccerM?.generated_note).not.toContain("Force-strong");
    expect(soccerM?.generated_note).toMatch(
      /Top 5 are Form-deficient|Top 5's gap is Form/
    );
    expect(themes.groups.some((g) => g.gender === "F")).toBe(false);
  });

  it("calls a balanced roster Balanced, not Balanced-deficient", () => {
    const athletes = Array.from({ length: 6 }, (_, i) =>
      athlete({
        id: String(i + 1),
        primary: "balanced",
        reference_40: 4.8 + i * 0.01,
      })
    );
    const note = buildF2fThemes(athletes).groups[0].generated_note;
    expect(note).toContain("Roster is Balanced");
    expect(note).not.toContain("Balanced-deficient");
    expect(note).toContain("Top 5 are balanced.");
  });

  it("uses a saved note when present", () => {
    const athletes = [
      athlete({ id: "1", primary: "force", reference_40: 5 }),
      athlete({ id: "2", primary: "force", reference_40: 5.1 }),
    ];
    const key = themeGroupKey("soccer", "M");
    const themes = buildF2fThemes(athletes, { [key]: "the gap is Force, not speed" });
    expect(themes.groups[0].note).toBe("the gap is Force, not speed");
  });
});

describe("formatMixCounts", () => {
  it("skips zero counts", () => {
    expect(
      formatMixCounts({ explosion: 0, force: 3, form: 3, balanced: 2 })
    ).toBe("Force 3 · Form 3 · Balanced 2");
  });
});
