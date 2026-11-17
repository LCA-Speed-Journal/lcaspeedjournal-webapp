export type ComparisonCandidate = {
  id: string;
  fortyCount: number;
  soccerTagged: boolean;
};

export function pickComparisonSession(rows: ComparisonCandidate[]): string | null {
  const eligible = rows.filter((row) => row.fortyCount > 0);
  const sorted = [...eligible].sort((a, b) => {
    if (a.soccerTagged !== b.soccerTagged) return a.soccerTagged ? -1 : 1;
    if (a.fortyCount !== b.fortyCount) return b.fortyCount - a.fortyCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[0]?.id ?? null;
}