import { graduatingClassToGrade } from "@/lib/quick-athlete";
import {
  FORTY_YD_DASH,
  FORTY_YD_PRIMARY_COMPONENT,
  TWENTY_YD_DASH,
  TWENTY_YD_PRIMARY_COMPONENT,
} from "@/lib/norms/editor-metrics";
import { formatPlace, type ScoredSortRow } from "@/lib/norms/testing-day-rank";
import {
  testingDayColumnKey,
  type TestingDayMatrixAthlete,
} from "@/lib/norms/testing-day";
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

export type SectionPlace = {
  rank: number;
  tied: boolean;
};

function cellRank(
  athlete: TestingDayMatrixAthlete,
  metricKey: string,
  component: string | null
): number | null {
  return athlete.cells[testingDayColumnKey(metricKey, component)]?.rank ?? null;
}

function toScoredSortRow(athlete: TestingDayMatrixAthlete): ScoredSortRow {
  return {
    athlete_id: athlete.athlete_id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    total_points: athlete.total_points ?? 0,
    rank_40: cellRank(athlete, FORTY_YD_DASH, FORTY_YD_PRIMARY_COMPONENT),
    rank_20: cellRank(athlete, TWENTY_YD_DASH, TWENTY_YD_PRIMARY_COMPONENT),
  };
}

function sameScoringKeys(
  a: ScoredSortRow,
  b: ScoredSortRow,
  has40: boolean,
  has20: boolean
): boolean {
  if (a.total_points !== b.total_points) return false;
  if (has40) {
    const ar = a.rank_40 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_40 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return false;
  }
  if (has20) {
    const ar = a.rank_20 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_20 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return false;
  }
  return true;
}

export function sectionRanks(
  athletes: TestingDayMatrixAthlete[],
  has40: boolean,
  has20: boolean
): Map<string, SectionPlace> {
  const ranks = new Map<string, SectionPlace>();
  const rows = athletes.map(toScoredSortRow);
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && sameScoringKeys(rows[i], rows[j], has40, has20)) {
      j += 1;
    }
    const place: SectionPlace = { rank: i + 1, tied: j - i > 1 };
    for (let k = i; k < j; k++) {
      ranks.set(rows[k].athlete_id, place);
    }
    i = j;
  }
  return ranks;
}

export function athleteSubline(
  place: SectionPlace,
  grade: string | null
): string {
  const placeText = formatPlace(place.rank, place.tied);
  return grade ? `${placeText} — ${grade}` : placeText;
}

export function stampGraduatingClass<
  T extends { athlete_id: string; graduating_class?: number | null },
>(athletes: T[], byId: Map<string, number | null>): T[] {
  return athletes.map((athlete) => ({
    ...athlete,
    graduating_class: byId.get(athlete.athlete_id) ?? null,
  }));
}
