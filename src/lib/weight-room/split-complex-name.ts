/**
 * Split a complex movement name into component names.
 * Only spaced slashes count: "Sit-Up / Side-Plank / Crawl".
 * Compact forms like "Y's/T's" or "A/B" stay one name.
 */
export function splitComplexName(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s+\/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}
