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
