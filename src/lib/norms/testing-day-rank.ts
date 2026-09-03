export const PLACE_POINTS = [10, 8, 7, 6, 4, 3, 2, 1] as const;

export type GenderPool = "M" | "F" | "U";

export function genderPool(
  gender: "M" | "F" | null | undefined
): GenderPool {
  return gender === "M" || gender === "F" ? gender : "U";
}

export function pointsForPlace(place: number): number {
  if (place < 1 || place > 8) return 0;
  return PLACE_POINTS[place - 1];
}

export type RankMarkInput = {
  athlete_id: string;
  gender: "M" | "F" | null;
  display_value: number;
};

export type RankedMark = RankMarkInput & {
  rank: number;
  tied: boolean;
  points: number;
};

export function rankMarksWithinGender(
  marks: RankMarkInput[],
  lowerIsBetter: boolean
): RankedMark[] {
  const buckets = new Map<GenderPool, RankMarkInput[]>();
  for (const mark of marks) {
    const pool = genderPool(mark.gender);
    const list = buckets.get(pool) ?? [];
    list.push(mark);
    buckets.set(pool, list);
  }

  const out: RankedMark[] = [];
  for (const poolMarks of buckets.values()) {
    const sorted = poolMarks.toSorted((a, b) => {
      if (a.display_value !== b.display_value) {
        return lowerIsBetter
          ? a.display_value - b.display_value
          : b.display_value - a.display_value;
      }
      return a.athlete_id.localeCompare(b.athlete_id);
    });
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (
        j < sorted.length &&
        sorted[j].display_value === sorted[i].display_value
      ) {
        j += 1;
      }
      const place = i + 1;
      const tied = j - i > 1;
      const points = pointsForPlace(place);
      for (let k = i; k < j; k++) {
        out.push({ ...sorted[k], rank: place, tied, points });
      }
      i = j;
    }
  }
  return out;
}

export function formatPlace(place: number, tied: boolean): string {
  const j = place % 10;
  const k = place % 100;
  let suffix = "th";
  if (j === 1 && k !== 11) suffix = "st";
  else if (j === 2 && k !== 12) suffix = "nd";
  else if (j === 3 && k !== 13) suffix = "rd";
  return `${tied ? "T-" : ""}${place}${suffix}`;
}

export const SPRINT_FAMILY_METRIC_KEYS = [
  "40yd_Dash",
  "20yd_Dash",
  "MaxVelocity",
] as const;

export function isSprintFamilyMetric(metricKey: string): boolean {
  return (SPRINT_FAMILY_METRIC_KEYS as readonly string[]).includes(metricKey);
}

export function scoreAthleteTotals(
  pointsByMetric: Record<string, number>
): { sprint_points: number; total_points: number } {
  const sprint: number[] = [];
  let other = 0;
  for (const [key, points] of Object.entries(pointsByMetric)) {
    if (isSprintFamilyMetric(key)) sprint.push(points);
    else other += points;
  }
  const sprint_points =
    sprint.length === 0
      ? 0
      : sprint.reduce((sum, n) => sum + n, 0) / sprint.length;
  return { sprint_points, total_points: sprint_points + other };
}

export type ScoredSortRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  total_points: number;
  rank_40: number | null;
  rank_20: number | null;
};

export function compareScoredAthletes(
  a: ScoredSortRow,
  b: ScoredSortRow,
  has40: boolean,
  has20: boolean
): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  if (has40) {
    const ar = a.rank_40 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_40 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
  }
  if (has20) {
    const ar = a.rank_20 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_20 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
  }
  return (
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name) ||
    a.athlete_id.localeCompare(b.athlete_id)
  );
}
