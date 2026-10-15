import { estimateSet, toPatternReference } from "./estimate";
import { patternReference, type StrengthPattern } from "./exercises";

export type LoggedStrengthSet = {
  athleteId: string;
  date: string;
  movementName: string;
  load: number | null;
  reps: number | null;
  target: string | null;
  rpeOverride: number | null;
};

export type PatternPoint = {
  athleteId: string;
  date: string;
  referenceE1rm: number;
  sourceMovement: string;
  load: number;
  reps: number;
  rpe: number;
};

const PATTERNS: readonly StrengthPattern[] = [
  "squat",
  "hinge",
  "single_leg",
  "press",
  "pull",
  "power",
];

/** One series per pattern. Each athlete keeps only the highest reference on a given day. */
export function buildPatternSeries(sets: readonly LoggedStrengthSet[]): Array<{
  pattern: StrengthPattern;
  referenceName: string;
  points: PatternPoint[];
}> {
  const best = new Map<string, { pattern: StrengthPattern; point: PatternPoint }>();

  for (const set of sets) {
    const estimated = estimateSet(set);
    if (!estimated || set.load == null || set.reps == null) continue;
    const reference = toPatternReference(set.movementName, estimated.exerciseE1rm);
    if (!reference) continue;

    const point: PatternPoint = {
      athleteId: set.athleteId,
      date: set.date,
      referenceE1rm: reference.referenceE1rm,
      sourceMovement: set.movementName,
      load: set.load,
      reps: set.reps,
      rpe: estimated.rpe,
    };
    const key = `${set.athleteId}\0${reference.pattern}\0${set.date}`;
    const current = best.get(key);
    if (!current || point.referenceE1rm > current.point.referenceE1rm) {
      best.set(key, { pattern: reference.pattern, point });
    }
  }

  const pointsByPattern = new Map<StrengthPattern, PatternPoint[]>();
  for (const entry of best.values()) {
    const list = pointsByPattern.get(entry.pattern);
    if (list) list.push(entry.point);
    else pointsByPattern.set(entry.pattern, [entry.point]);
  }

  return PATTERNS.map((pattern) => ({
    pattern,
    referenceName: patternReference(pattern).name,
    points: (pointsByPattern.get(pattern) ?? []).toSorted((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.athleteId !== b.athleteId) return a.athleteId < b.athleteId ? -1 : 1;
      return 0;
    }),
  }));
}

/** Last point strictly before `date`. A same-day point is not a prior reference. */
export function latestReferenceBefore<T extends { date: string }>(
  points: readonly T[],
  date: string
): T | null {
  let latest: T | null = null;
  for (const point of points) {
    if (point.date >= date) continue;
    if (latest == null || point.date >= latest.date) latest = point;
  }
  return latest;
}

/** One-time snapshot. Later squat or bench changes do not move hinge, single-leg, or pull. */
export function seedPatternsFromAnchors(anchors: {
  squat: number;
  bench: number;
  power: number;
}): Record<StrengthPattern, number> {
  return {
    squat: anchors.squat,
    press: anchors.bench,
    power: anchors.power,
    hinge: anchors.squat * 1.15,
    single_leg: anchors.squat * 0.5,
    pull: anchors.bench * 0.75,
  };
}
