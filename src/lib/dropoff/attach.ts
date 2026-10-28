import { summarizeDropoff, type DropoffDirection } from "./summarize";

export type DropoffAttempt = {
  athleteId: string;
  id: string;
  createdAt: string;
  displayValue: number;
};

export type DropoffFields = {
  session_initial: number;
  dropoff_line: number;
  dropoff_percent: number;
  attempts_above_line: number;
  crossed_dropoff: boolean;
};

export function attachDropoff<T extends { athlete_id: string }>(
  rows: T[],
  attempts: DropoffAttempt[],
  direction: DropoffDirection
): Array<T & Partial<DropoffFields>> {
  const byAthlete = new Map<string, DropoffAttempt[]>();
  for (const attempt of attempts) {
    const list = byAthlete.get(attempt.athleteId);
    if (list) list.push(attempt);
    else byAthlete.set(attempt.athleteId, [attempt]);
  }

  return rows.map((row) => {
    const list = byAthlete.get(row.athlete_id);
    if (!list || list.length === 0) return row;
    const ordered = list.slice().sort((a, b) => {
      const byTime = a.createdAt.localeCompare(b.createdAt);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
    const summary = summarizeDropoff(
      ordered.map((attempt) => attempt.displayValue),
      direction
    );
    if (!summary) return row;
    return {
      ...row,
      session_initial: summary.initial,
      dropoff_line: summary.dropoffLine,
      dropoff_percent: summary.dropoffPercent,
      attempts_above_line: summary.attemptsAboveLine,
      crossed_dropoff: summary.crossedDropoff,
    };
  });
}
