export type RankDirection = "higher" | "lower";

export type FieldMark = {
  athlete_id: string;
  value: number;
};

export type FieldRank = FieldMark & {
  rank: number;
  tied: boolean;
  points: number;
};

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
    const points = marks.length - j + 1;
    for (let k = i; k < j; k += 1) {
      out.push({ ...sorted[k], rank, tied, points });
    }
    i = j;
  }
  return out;
}
