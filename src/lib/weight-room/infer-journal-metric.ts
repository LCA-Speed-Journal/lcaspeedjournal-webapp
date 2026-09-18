import { getMetricsRegistry } from "@/lib/parser";

/**
 * Infer a Speed Journal metric from a weight-room movement name.
 * Skips submax / warm-up style labels so we don't dual-write junk marks.
 */
export function inferSpeedJournalMetricKey(
  name: string | null | undefined
): string | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  if (/\bsubmax\b/.test(n)) return null;

  if (/standing\s*broad|\bbroad\s*jump\b/.test(n)) {
    return "Standing-Broad";
  }
  if (/\bcmj\b/.test(n) || /\bvertical\s*jump\b/.test(n)) {
    return "Vertical Jump";
  }

  const registry = getMetricsRegistry();
  if (registry[name?.trim() ?? ""]) return name!.trim();
  return null;
}
