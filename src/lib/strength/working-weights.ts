import { lookupExercise, patternReference, type StrengthPattern } from "./exercises";
import { roundTo5Lb, suggestedLoad } from "./estimate";
import { percentOf1Rm } from "./relative-intensity";
import { resolveSetRpe } from "./rpe";
import { latestReferenceBefore } from "./series";

export type WorkingWeightCell =
  | { kind: "load"; pounds: number }
  | { kind: "ceiling"; pounds: number }
  | null;

export type WorkingWeightRow = {
  name: string;
  cells: Array<{ athleteId: string; value: WorkingWeightCell }>;
};

type Movement = {
  name: string;
  targets: string[];
  set_count: number;
};

type Athlete = {
  athleteId: string;
  patterns: Array<{
    pattern: StrengthPattern;
    points: Array<{ date: string; referenceE1rm: number }>;
  }>;
  baselines: Partial<Record<StrengthPattern, number>>;
};

type ResolvedTarget = {
  rpe: number | null;
  prescribedReps: number | null;
  rmAttempt: boolean;
};

/** One row per movement that has a load or RM target. Each cell uses only that pattern. */
export function buildWorkingWeights(input: {
  sessionDate: string;
  movements: Movement[];
  athletes: Athlete[];
}): WorkingWeightRow[] {
  const rows: WorkingWeightRow[] = [];

  for (const movement of input.movements) {
    const exercise = lookupExercise(movement.name);
    if (!exercise) continue;
    const target = firstQualifiedTarget(movement.targets);
    if (!target) continue;

    rows.push({
      name: movement.name,
      cells: input.athletes.map((athlete) => ({
        athleteId: athlete.athleteId,
        value: cellFor(athlete, movement.name, exercise.pattern, target, input.sessionDate),
      })),
    });
  }

  return rows;
}

function firstQualifiedTarget(targets: readonly string[]): ResolvedTarget | null {
  for (const target of targets) {
    const resolved = resolveSetRpe({ target, rpeOverride: null });
    if (resolved.rmAttempt || resolved.rpe != null) return resolved;
  }
  return null;
}

function patternReferenceE1rm(
  athlete: Athlete,
  pattern: StrengthPattern,
  sessionDate: string
): number | null {
  const points = athlete.patterns.find((series) => series.pattern === pattern)?.points ?? [];
  const prior = latestReferenceBefore(points, sessionDate);
  if (prior) return prior.referenceE1rm;
  const baseline = athlete.baselines[pattern];
  return baseline == null ? null : baseline;
}

function cellFor(
  athlete: Athlete,
  movementName: string,
  pattern: StrengthPattern,
  target: ResolvedTarget,
  sessionDate: string
): WorkingWeightCell {
  const referenceE1rm = patternReferenceE1rm(athlete, pattern, sessionDate);
  if (referenceE1rm == null) return null;

  if (target.rmAttempt) {
    return ceilingCell(movementName, pattern, referenceE1rm, target.prescribedReps);
  }

  if (target.rpe == null || target.prescribedReps == null) return null;
  const pounds = suggestedLoad({
    pattern,
    referenceE1rm,
    movementName,
    reps: target.prescribedReps,
    rpe: target.rpe,
  });
  if (pounds == null) return null;
  return { kind: "load", pounds };
}

/** Test ceiling: pattern reference scaled like suggestedLoad, then the RPE-10 chart percent. */
function ceilingCell(
  movementName: string,
  pattern: StrengthPattern,
  referenceE1rm: number,
  prescribedReps: number | null
): WorkingWeightCell {
  if (prescribedReps == null) return null;
  if (!Number.isFinite(referenceE1rm) || referenceE1rm <= 0) return null;
  const exercise = lookupExercise(movementName);
  if (!exercise || exercise.pattern !== pattern) return null;
  const reference = patternReference(pattern);
  if (exercise.parent !== reference.parent) return null;
  const pct = percentOf1Rm(prescribedReps, 10);
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  const exerciseMax = referenceE1rm * (exercise.ratio / reference.ratio);
  const pounds = roundTo5Lb(exerciseMax * pct);
  if (!Number.isFinite(pounds)) return null;
  return { kind: "ceiling", pounds };
}
