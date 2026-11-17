export type RankDirection = "higher" | "lower";

export type FieldMark = {
  athlete_id: string;
  value: number;
};

export type FieldRank = FieldMark & {
  rank: number;
  tied: boolean;
  /** Points shown for this place. Zero from 9th on. */
  points: number;
  /** Hidden ordering value. Zero inside the top 8, then 1/2, 1/4, 1/8, and so on. */
  order_points: number;
};

/** 1st through 8th. A tie takes the points for the shared place. */
export const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1] as const;

export function placeScore(rank: number): { points: number; order_points: number } {
  if (rank >= 1 && rank <= PLACE_POINTS.length) {
    return { points: PLACE_POINTS[rank - 1], order_points: 0 };
  }
  const stepsPast = Math.max(1, rank - PLACE_POINTS.length);
  return { points: 0, order_points: 2 ** -stepsPast };
}

export function rankFullField(
  marks: FieldMark[],
  direction: RankDirection
): FieldRank[] {
  const sorted = marks.toSorted((a, b) => {
    if (a.value !== b.value) {
      return direction === "lower" ? a.value - b.value : b.value - a.value;
    }
    return a.athlete_id.localeCompare(b.athlete_id);
  });
  const out: FieldRank[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const rank = i + 1;
    const tied = j - i > 1;
    const score = placeScore(rank);
    for (let k = i; k < j; k += 1) {
      out.push({ ...sorted[k], rank, tied, ...score });
    }
    i = j;
  }
  return out;
}
