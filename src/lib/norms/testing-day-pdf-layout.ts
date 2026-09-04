import { graduatingClassToGrade } from "@/lib/quick-athlete";
import { formatPlace } from "@/lib/norms/testing-day-rank";
import type { TestingDayMatrixAthlete } from "@/lib/norms/testing-day";
import { themeGroupKey } from "@/lib/norms/f2f/themes";
import { HUGO_GROUP_META, isHugoGroup } from "@/lib/weight-room/constants";

const GENDERED_SPORT_LABEL = /^(men'?s|women'?s)\b/i;

export type TestingDayPdfSection = {
  sport: string | null;
  gender: TestingDayMatrixAthlete["gender"];
  athletes: TestingDayMatrixAthlete[];
};

function sportLabel(sport: string | null): string {
  if (sport == null) return "No primary sport";
  if (isHugoGroup(sport)) return HUGO_GROUP_META[sport].label;
  return sport;
}

function genderPrefix(gender: string | null): string | null {
  if (gender === "M") return "Boys";
  if (gender === "F") return "Girls";
  return null;
}

function genderSortRank(gender: string | null): number {
  if (gender === "M") return 0;
  if (gender === "F") return 1;
  return 2;
}

export function sectionHeading(
  sport: string | null,
  gender: string | null
): string {
  const label = sportLabel(sport);
  const prefix = genderPrefix(gender);
  if (prefix && !GENDERED_SPORT_LABEL.test(label)) {
    return `Testing Day: ${prefix} ${label}`;
  }
  return `Testing Day: ${label}`;
}

export function formatPdfDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const local = new Date(year, month - 1, day);
  const monthName = local.toLocaleString("en-US", { month: "long" });
  return `${monthName} ${formatPlace(local.getDate(), false)}, ${local.getFullYear()}`;
}

export function formatPdfGrade(
  graduatingClass: number | null,
  now: Date
): string | null {
  const grade = graduatingClassToGrade(graduatingClass, now);
  if (grade == null) return null;
  return formatPlace(grade, false);
}

export function sectionSubhead(isoDate: string, athleteCount: number): string {
  const noun = athleteCount === 1 ? "Athlete" : "Athletes";
  return `${formatPdfDate(isoDate)} — ${athleteCount} ${noun}`;
}

export function groupAthletesBySection(
  athletes: TestingDayMatrixAthlete[]
): TestingDayPdfSection[] {
  const sections = new Map<string, TestingDayPdfSection>();
  for (const athlete of athletes) {
    const key = themeGroupKey(athlete.sport, athlete.gender);
    const existing = sections.get(key);
    if (existing) {
      existing.athletes.push(athlete);
      continue;
    }
    sections.set(key, {
      sport: athlete.sport,
      gender: athlete.gender,
      athletes: [athlete],
    });
  }

  return [...sections.values()].toSorted((a, b) => {
    const bySport = sportLabel(a.sport).localeCompare(sportLabel(b.sport));
    if (bySport !== 0) return bySport;
    return genderSortRank(a.gender) - genderSortRank(b.gender);
  });
}
