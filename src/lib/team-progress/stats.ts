export type StatBox = {
  min: number;
  mean: number;
  median: number;
  max: number;
};

export type SeriesPoint = {
  date: string;
  median: number;
  n: number;
  median_change_pct?: number | null;
  output?: StatBox;
  change?: StatBox;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function summarize(values: number[]): StatBox | null {
  if (values.length === 0) return null;
  const med = median(values);
  if (med == null) return null;
  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, mean: sum / values.length, median: med, max };
}

export function percentChange(value: number, baseline: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) {
    return null;
  }
  return ((value - baseline) / Math.abs(baseline)) * 100;
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

/** Earliest YYYY-MM-DD, or null if empty. */
export function earliestDate(dates: readonly string[]): string | null {
  const sorted = [...dates].filter(Boolean).sort();
  return sorted[0] ?? null;
}

/**
 * Season week/day relative to the team's first logged session (W1D1).
 * Week = ISO-week index from the anchor's week (1-based).
 * Day = order of this date among `teamSessionDates` in that ISO week (1-based).
 */
export function seasonWeekDay(
  date: string,
  anchor: string,
  teamSessionDates: readonly string[]
): { week: number; day: number } | null {
  if (!date || !anchor || date < anchor) return null;
  const anchorMonday = isoWeekStart(anchor);
  const dateMonday = isoWeekStart(date);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const week =
    1 +
    Math.round(
      (Date.parse(`${dateMonday}T12:00:00.000Z`) -
        Date.parse(`${anchorMonday}T12:00:00.000Z`)) /
        msPerWeek
    );
  if (week < 1) return null;

  const inWeek = [
    ...new Set(teamSessionDates.filter((d) => d >= anchor)),
  ]
    .filter((d) => isoWeekStart(d) === dateMonday)
    .sort();
  const day = inWeek.indexOf(date) + 1;
  if (day < 1) return null;
  return { week, day };
}

export function formatSeasonWeekDay(
  date: string,
  anchor: string | null | undefined,
  teamSessionDates: readonly string[]
): string | null {
  if (!anchor) return null;
  const wd = seasonWeekDay(date, anchor, teamSessionDates);
  if (!wd) return null;
  return `W${wd.week}D${wd.day}`;
}
