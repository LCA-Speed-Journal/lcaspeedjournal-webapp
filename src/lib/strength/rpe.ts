const TARGET_RPE = /(\d+)\s*(?:\/\s*side)?\s*@\s*RPE\s*(\d+(?:\.\d+)?)/i;
const RM_ATTEMPT = /(\d+)\s*RM/i;

export function resolveSetRpe(input: {
  target: string | null;
  rpeOverride: number | null;
}): { rpe: number | null; prescribedReps: number | null; rmAttempt: boolean } {
  const target = input.target?.trim() ?? "";
  const rm = target.match(RM_ATTEMPT);
  const rmAttempt = rm != null && /attempt|test/i.test(target);
  const prescribed = target.match(TARGET_RPE);
  const prescribedReps = prescribed
    ? Number(prescribed[1])
    : rmAttempt && rm
      ? Number(rm[1])
      : null;
  const fromCard = prescribed ? Number(prescribed[2]) : rmAttempt ? 10 : null;
  const rpe = input.rpeOverride ?? fromCard;
  return { rpe, prescribedReps, rmAttempt };
}

/** Effective RPE. Delta is snapped to 0.5 and limited to ±1.5, then clamped to 3–10. */
export function applyRpeNudge(prescribed: number, delta: number): number {
  const snapped = Math.round(delta * 2) / 2;
  const limited = Math.max(-1.5, Math.min(1.5, snapped));
  const next = prescribed + limited;
  return Math.max(3, Math.min(10, next));
}
