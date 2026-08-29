import type { ParsedLoadReps } from "@/types/weight-room";

const unknown = (raw: string): ParsedLoadReps => ({
  raw,
  kind: "unknown",
  load: null,
  reps: null,
  units: null,
});

export function parseLoadReps(raw: string): ParsedLoadReps {
  const trimmed = raw.trim();

  if (!trimmed) {
    return unknown(trimmed);
  }

  if (/^(bw|body\s*weight)$/i.test(trimmed)) {
    return { raw: trimmed, kind: "bw", load: null, reps: null, units: null };
  }

  const amrap = trimmed.match(/^amrap\s+(\d+)$/i);
  if (amrap) {
    return {
      raw: trimmed,
      kind: "amrap",
      load: null,
      reps: Number(amrap[1]),
      units: null,
    };
  }

  const inches = trimmed.match(/^(\d+(?:\.\d+)?)\s*in$/i);
  if (inches) {
    return {
      raw: trimmed,
      kind: "output",
      load: Number(inches[1]),
      reps: null,
      units: "in",
    };
  }

  const loadXReps = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(?:lbs?)?\s*[x×]\s*(\d+)$/i,
  );
  if (loadXReps) {
    return {
      raw: trimmed,
      kind: "load_reps",
      load: Number(loadXReps[1]),
      reps: Number(loadXReps[2]),
      units: "lb",
    };
  }

  const loadLbsReps = trimmed.match(/^(\d+(?:\.\d+)?)\s*lbs?\s+(\d+)$/i);
  if (loadLbsReps) {
    return {
      raw: trimmed,
      kind: "load_reps",
      load: Number(loadLbsReps[1]),
      reps: Number(loadLbsReps[2]),
      units: "lb",
    };
  }

  return unknown(trimmed);
}
