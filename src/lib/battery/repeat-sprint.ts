export type RepeatSprintScore = {
  best: number;
  mean: number;
  decrement: number;
};

export type RepeatSeriesRep = {
  athlete_id: string;
  raw_input: string;
  interval_index: number;
  value: number;
  created_at: number;
};

/** One complete 10x10 per athlete: latest raw_input, and the later rep when an interval was saved twice. */
export function latestRepeatSeriesTimes(rows: RepeatSeriesRep[]): Map<string, number[]> {
  const byAthlete = new Map<string, Map<string, RepeatSeriesRep[]>>();
  for (const row of rows) {
    if (!Number.isInteger(row.interval_index) || row.interval_index < 1 || row.interval_index > 10) {
      continue;
    }
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    let byInput = byAthlete.get(row.athlete_id);
    if (!byInput) {
      byInput = new Map();
      byAthlete.set(row.athlete_id, byInput);
    }
    const series = byInput.get(row.raw_input);
    if (series) series.push(row);
    else byInput.set(row.raw_input, [row]);
  }

  const chosen = new Map<string, number[]>();
  for (const [athleteId, byInput] of byAthlete) {
    let best: { created_at: number; times: number[] } | null = null;
    for (const series of byInput.values()) {
      const byInterval = new Map<number, RepeatSeriesRep>();
      for (const rep of series) {
        const current = byInterval.get(rep.interval_index);
        if (!current || rep.created_at >= current.created_at) byInterval.set(rep.interval_index, rep);
      }
      if (byInterval.size !== 10) continue;
      const times: number[] = [];
      let createdAt = Number.NEGATIVE_INFINITY;
      for (let index = 1; index <= 10; index += 1) {
        const rep = byInterval.get(index);
        if (!rep) {
          times.length = 0;
          break;
        }
        times.push(rep.value);
        if (rep.created_at > createdAt) createdAt = rep.created_at;
      }
      if (times.length !== 10) continue;
      if (!best || createdAt >= best.created_at) best = { created_at: createdAt, times };
    }
    if (best) chosen.set(athleteId, best.times);
  }
  return chosen;
}

export function scoreRepeatSprint(times: number[]): RepeatSprintScore | null {
  if (times.length !== 10) return null;
  if (times.some((time) => !Number.isFinite(time) || time <= 0)) return null;
  const best = Math.min(...times);
  const sum = times.reduce((total, time) => total + time, 0);
  return {
    best,
    mean: sum / 10,
    decrement: (sum / (best * 10) - 1) * 100,
  };
}
