export function buildHistoricalLeaderboardUrl(opts: {
  from: string;
  to: string;
  metric: string;
  phase?: string;
  groupByGender?: boolean;
  populationId?: string;
}): string | null {
  if (!opts.from || !opts.to || !opts.metric) return null;
  let url = `/api/leaderboard/historical?from=${encodeURIComponent(opts.from)}&to=${encodeURIComponent(opts.to)}&metric=${encodeURIComponent(opts.metric)}`;
  if (opts.phase) url += `&phase=${encodeURIComponent(opts.phase)}`;
  if (opts.groupByGender) url += `&group_by=gender`;
  if (opts.populationId) url += `&population_id=${encodeURIComponent(opts.populationId)}`;
  return url;
}
