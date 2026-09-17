export type WarmupDrill = {
  name: string;
  dose: string;
};

/** Trailing dose: 45s/leg, 15/side, 1×10/leg, ×15, 45–60s, 2×6–8, etc. */
const DOSE_RE =
  /^(.*?)(?:\s+)((?:\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*s(?:\/\w+)?)|(?:\d+\/\w+)|(?:\d+\s*[x×]\s*\d+(?:\s*[–-]\s*\d+)?)(?:\/\w+)?|(?:[x×]\s*\d+))$/i;

/**
 * Split a warmup notes blob into named drills + trailing dose strings.
 * List delimiters: · ; newlines; em-dash; spaced en-dash/hyphen only.
 * Does not split hyphenated words or compact dose ranges (45-60s).
 */
export function splitWarmupDrills(notes: string): WarmupDrill[] {
  const trimmed = notes.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/\s*[·;]\s*|\n+|\s*—\s*|(?<=\s)[–-](?=\s)/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const m = part.match(DOSE_RE);
    if (!m) return { name: part, dose: "" };
    return { name: m[1]!.trim(), dose: m[2]!.trim() };
  });
}
