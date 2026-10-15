const RPE_VALUE = /@\s*RPE\s*(\d+(?:\.\d+)?)/i;
const REP_RANGE = /(\d+)\s*[-\u2013]\s*(\d+)/;
const REP_PLUS = /(\d+)\s*\+/;
const REP_COUNT = /(\d+)/;
const RM_ATTEMPT = /(\d+)\s*RM/i;

export function resolveSetRpe(input: {
  target: string | null;
  rpeOverride: number | null;
}): { rpe: number | null; prescribedReps: number | null; rmAttempt: boolean } {
  const target = input.target?.trim() ?? "";
  const rpeMatch = target.match(RPE_VALUE);
  const rm = target.match(RM_ATTEMPT);
  const rmAttempt = rm != null;

  let prescribedReps: number | null = null;
  if (rpeMatch?.index != null) {
    const before = target.slice(0, rpeMatch.index).replace(/\/\s*side/gi, "").trim();
    if (!/^AMRAP$/i.test(before)) {
      const range = before.match(REP_RANGE);
      const plus = before.match(REP_PLUS);
      const count = before.match(REP_COUNT);
      prescribedReps = range
        ? Number(range[2])
        : plus
          ? Number(plus[1])
          : count
            ? Number(count[1])
            : null;
    }
  } else if (rm) {
    prescribedReps = Number(rm[1]);
  }

  const fromCard = rpeMatch ? Number(rpeMatch[1]) : rmAttempt ? 10 : null;
  const rpe = input.rpeOverride ?? fromCard;
  return { rpe, prescribedReps, rmAttempt };
}

/** Effective RPE. Delta is snapped to 0.5 and limited to ±1.5, then clamped to 3–10. */
export function applyRpeNudge(prescribed: number, delta: number): number {
  const snapped = Math.sign(delta) * Math.round(Math.abs(delta) * 2) / 2;
  const limited = Math.max(-1.5, Math.min(1.5, snapped));
  const next = prescribed + limited;
  return Math.max(3, Math.min(10, next));
}
