import { lookupExercise, patternReference, type StrengthPattern } from "./exercises";
import { percentOf1Rm } from "./relative-intensity";
import { resolveSetRpe } from "./rpe";

export function roundTo5Lb(lb: number): number {
  return Math.round(lb / 5) * 5;
}

export function estimateSet(input: {
  movementName: string;
  load: number | null;
  reps: number | null;
  target: string | null;
  rpeOverride: number | null;
}): { rpe: number; exerciseE1rm: number } | null {
  if (input.load == null || !Number.isFinite(input.load) || input.load <= 0) return null;
  if (input.reps == null || !Number.isInteger(input.reps) || input.reps < 1) return null;
  const resolved = resolveSetRpe({ target: input.target, rpeOverride: input.rpeOverride });
  if (resolved.rpe == null || !Number.isFinite(resolved.rpe)) return null;
  const pct = percentOf1Rm(input.reps, resolved.rpe);
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  return { rpe: resolved.rpe, exerciseE1rm: input.load / pct };
}

export function toPatternReference(
  movementName: string,
  exerciseE1rm: number
): { pattern: StrengthPattern; referenceName: string; referenceE1rm: number } | null {
  if (!Number.isFinite(exerciseE1rm) || exerciseE1rm <= 0) return null;
  const exercise = lookupExercise(movementName);
  if (!exercise) return null;
  const reference = patternReference(exercise.pattern);
  if (exercise.parent !== reference.parent) return null;
  if (!Number.isFinite(exercise.ratio) || exercise.ratio <= 0) return null;
  if (!Number.isFinite(reference.ratio) || reference.ratio <= 0) return null;
  return {
    pattern: exercise.pattern,
    referenceName: reference.name,
    referenceE1rm: exerciseE1rm * (reference.ratio / exercise.ratio),
  };
}

export function suggestedLoad(input: {
  pattern: StrengthPattern;
  referenceE1rm: number;
  movementName: string;
  reps: number;
  rpe: number;
}): number | null {
  if (!Number.isFinite(input.referenceE1rm) || input.referenceE1rm <= 0) return null;
  const exercise = lookupExercise(input.movementName);
  if (!exercise || exercise.pattern !== input.pattern) return null;
  const reference = patternReference(input.pattern);
  if (exercise.parent !== reference.parent) return null;
  const pct = percentOf1Rm(input.reps, input.rpe);
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  const exerciseMax = input.referenceE1rm * (exercise.ratio / reference.ratio);
  return roundTo5Lb(exerciseMax * pct);
}
