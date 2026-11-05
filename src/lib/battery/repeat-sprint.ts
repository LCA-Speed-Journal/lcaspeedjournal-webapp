export type RepeatSprintScore = {
  best: number;
  mean: number;
  decrement: number;
};

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
