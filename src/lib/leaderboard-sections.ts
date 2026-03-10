import type { LeaderboardRow } from "@/types";

export type LeaderboardSection = { title: string; rows: LeaderboardRow[] };

function isAlumni(r: LeaderboardRow): boolean {
  return (r.athlete_type ?? "athlete") === "alumni";
}

export function getLeaderboardSections(options: {
  rows: LeaderboardRow[];
  male?: LeaderboardRow[];
  female?: LeaderboardRow[];
  groupByGender: boolean;
  splitByAlumni: boolean;
}): LeaderboardSection[] {
  const { rows, male = [], female = [], groupByGender, splitByAlumni } = options;

  if (groupByGender && (male.length > 0 || female.length > 0)) {
    if (splitByAlumni) {
      const maleAthletes = male.filter((r) => !isAlumni(r));
      const femaleAthletes = female.filter((r) => !isAlumni(r));
      const maleAlumni = male.filter(isAlumni);
      const femaleAlumni = female.filter(isAlumni);
      const sections: LeaderboardSection[] = [
        { title: "Athletes (Boys)", rows: maleAthletes },
        { title: "Athletes (Girls)", rows: femaleAthletes },
        { title: "Alumni (Boys)", rows: maleAlumni },
        { title: "Alumni (Girls)", rows: femaleAlumni },
      ].filter((s) => s.rows.length > 0);
      return sections.length > 0 ? sections : [{ title: "", rows }];
    }
    const sections: LeaderboardSection[] = [
      { title: "Boys", rows: male },
      { title: "Girls", rows: female },
    ].filter((s) => s.rows.length > 0);
    return sections.length > 0 ? sections : [{ title: "", rows }];
  }

  if (splitByAlumni) {
    const athletes = rows.filter((r) => !isAlumni(r));
    const alumni = rows.filter(isAlumni);
    const sections: LeaderboardSection[] = [
      { title: "Athletes", rows: athletes },
      { title: "Alumni", rows: alumni },
    ].filter((s) => s.rows.length > 0);
    return sections.length > 0 ? sections : [{ title: "", rows }];
  }

  return [{ title: "", rows }];
}
