export type SeriesPoint = {
  date: string;
  median: number;
  n: number;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Signed change last − first. For time metrics, negative is improvement. */
export function metricDelta(
  first: number | null | undefined,
  last: number | null | undefined,
  lowerIsBetter: boolean
): number | null {
  if (first == null || last == null) return null;
  void lowerIsBetter;
  return last - first;
}

export function isImproved(
  first: number,
  last: number,
  lowerIsBetter: boolean
): boolean {
  return lowerIsBetter ? last < first : last > first;
}

export function improvedPct(
  pairs: Array<{ first: number; last: number }>,
  lowerIsBetter: boolean
): number | null {
  if (pairs.length === 0) return null;
  let improved = 0;
  for (const p of pairs) {
    if (isImproved(p.first, p.last, lowerIsBetter)) improved += 1;
  }
  return improved / pairs.length;
}

export function firstLastEligible(
  points: SeriesPoint[],
  minN: number
): { first: SeriesPoint; last: SeriesPoint } | null {
  const eligible = points.filter((p) => p.n >= minN);
  if (eligible.length === 0) return null;
  const first = eligible[0]!;
  const last = eligible[eligible.length - 1]!;
  return { first, last };
}

/** Monday (UTC calendar) of the ISO week containing YYYY-MM-DD. */
export function isoWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
