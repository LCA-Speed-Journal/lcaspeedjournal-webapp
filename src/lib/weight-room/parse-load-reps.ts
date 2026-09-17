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

  // Duration: "45s", "45s/leg", "45–60s", "45-60s" (use upper bound for ranges)
  const durationRange = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*s(?:\/(?:leg|side))?$/i,
  );
  if (durationRange) {
    return {
      raw: trimmed,
      kind: "duration",
      load: Number(durationRange[2]),
      reps: null,
      units: "s",
    };
  }

  const duration = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*s(?:\/(?:leg|side))?$/i,
  );
  if (duration) {
    return {
      raw: trimmed,
      kind: "duration",
      load: Number(duration[1]),
      reps: null,
      units: "s",
    };
  }

  // Side/count doses: "15/side" — reps kind, not volume load_reps
  const sideReps = trimmed.match(/^(\d+)\s*\/\s*side$/i);
  if (sideReps) {
    return {
      raw: trimmed,
      kind: "reps",
      load: null,
      reps: Number(sideReps[1]),
      units: null,
    };
  }

  // Times-only reps: "×15", "x15"
  const timesReps = trimmed.match(/^[x×]\s*(\d+)$/i);
  if (timesReps) {
    return {
      raw: trimmed,
      kind: "reps",
      load: null,
      reps: Number(timesReps[1]),
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
