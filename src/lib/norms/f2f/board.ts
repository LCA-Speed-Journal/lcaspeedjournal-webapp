import type { TestingDayMatrixAthlete } from "../testing-day";
import { buildF2fProfile } from "./profile";
import { buildF2fThemes, type F2fThemeAthlete, type F2fThemes } from "./themes";
import type { F2fAthlete, F2fEntry, F2fProfile } from "./types";

export type AttachF2fProfileBuilder = (
  entries: F2fEntry[],
  athlete: F2fAthlete
) => F2fProfile;

export type AttachF2fToAthletesOptions = {
  buildProfile?: AttachF2fProfileBuilder;
  noteOverrides?: Record<string, string>;
};

export type AttachF2fToAthletesResult = {
  athletes: TestingDayMatrixAthlete[];
  f2f_themes: F2fThemes;
};

function toThemeAthlete(
  athlete: TestingDayMatrixAthlete,
  profile: F2fProfile
): F2fThemeAthlete {
  return {
    id: athlete.athlete_id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    sport: athlete.sport,
    gender: athlete.gender,
    eligible_for_labels: profile.eligible_for_labels,
    primary: profile.primary,
    reference_40: profile.reference_40,
  };
}

export function attachF2fToAthletes(
  athletes: TestingDayMatrixAthlete[],
  entriesByAthlete: Map<string, F2fEntry[]>,
  options: AttachF2fToAthletesOptions = {}
): AttachF2fToAthletesResult {
  const buildProfile = options.buildProfile ?? buildF2fProfile;
  const themeAthletes: F2fThemeAthlete[] = [];

  const next = athletes.map((athlete) => {
    try {
      const entries = entriesByAthlete.get(athlete.athlete_id) ?? [];
      const f2f = buildProfile(entries, { gender: athlete.gender });
      themeAthletes.push(toThemeAthlete(athlete, f2f));
      return { ...athlete, f2f };
    } catch {
      return { ...athlete };
    }
  });

  return {
    athletes: next,
    f2f_themes: buildF2fThemes(themeAthletes, options.noteOverrides ?? {}),
  };
}
