import { describe, expect, it } from "vitest";
import { buildF2fThemes, themeGroupKey } from "./themes";
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
    expect(soccerM?.generated_note.toLowerCase()).toContain("force");
    expect(themes.groups.some((g) => g.gender === "F")).toBe(false);
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
