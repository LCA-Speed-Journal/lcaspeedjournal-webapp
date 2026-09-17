import type { ParsedLoadReps } from "@/types/weight-room";

const unknown = (raw: string): ParsedLoadReps => ({
  raw,
  kind: "unknown",
  load: null,
  reps: null,
  units: null,
});

/** Normalize distance unit tokens to yd | ft | m. */
function normalizeDistanceUnit(raw: string): "yd" | "ft" | "m" | null {
  const u = raw.toLowerCase();
  if (u === "yd" || u === "yard" || u === "yards") return "yd";
  if (u === "ft" || u === "foot" || u === "feet") return "ft";
  if (u === "m" || u === "meter" || u === "meters" || u === "metre" || u === "metres")
    return "m";
  return null;
}

/** Per-side / per-each suffix after a dose (optional). */
const PER_SUFFIX = "(?:\\s*(?:p\\s*)?\\/(?:leg|side|ea|each))?";

export function parseLoadReps(raw: string): ParsedLoadReps {
  const trimmed = raw.trim();

  if (!trimmed) {
    return unknown(trimmed);
  }

  if (/^(bw|body\s*weight)$/i.test(trimmed)) {
    return { raw: trimmed, kind: "bw", load: null, reps: null, units: null };
  }

  // BW with reps: "BW x8", "BWx10", "bw × 12"
  const bwReps = trimmed.match(/^(?:bw|body\s*weight)\s*[x×]\s*(\d+)$/i);
  if (bwReps) {
    return {
      raw: trimmed,
      kind: "bw",
      load: null,
      reps: Number(bwReps[1]),
      units: null,
    };
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

  // Duration ranges: "45–60s", "45-60s" (+ optional /leg|/side|/ea)
  const durationRange = trimmed.match(
    new RegExp(
      `^(\\d+(?:\\.\\d+)?)\\s*[–-]\\s*(\\d+(?:\\.\\d+)?)\\s*s${PER_SUFFIX}$`,
      "i"
    )
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

  // Duration: "45s", "45s/leg", "45s/ea", "45s p/ea"
  const duration = trimmed.match(
    new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*s${PER_SUFFIX}$`, "i")
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

  // Reps with /side, /ea, p/ea: "15/side", "15/ea", "15 p/ea"
  const sideReps = trimmed.match(
    /^(\d+)\s*(?:p\s*)?\/\s*(?:side|ea|each)$/i
  );
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

  // Drill distance: "2x10yd", "2 × 30 yd"
  const distSets = trimmed.match(
    /^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(yd|yard|yards|ft|foot|feet|m|meters?|metres?)$/i
  );
  if (distSets) {
    const units = normalizeDistanceUnit(distSets[3]!);
    if (units) {
      return {
        raw: trimmed,
        kind: "distance",
        load: Number(distSets[2]),
        reps: Number(distSets[1]),
        units,
      };
    }
  }

  // Single distance: "10yd", "30 ft", "5m"
  const distAlone = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(yd|yard|yards|ft|foot|feet|m|meters?|metres?)$/i
  );
  if (distAlone) {
    const units = normalizeDistanceUnit(distAlone[2]!);
    if (units) {
      return {
        raw: trimmed,
        kind: "distance",
        load: Number(distAlone[1]),
        reps: null,
        units,
      };
    }
  }

  const loadXReps = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(?:lbs?)?\s*[x×]\s*(\d+)$/i
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
