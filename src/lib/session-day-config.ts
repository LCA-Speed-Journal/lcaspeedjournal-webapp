import {
  FORTY_YD_DASH,
  FORTY_YD_NAMED_FLIES,
} from "@/lib/norms/editor-metrics";
import { isFortyYardComponent } from "@/lib/norms/forty-yd";

const NAMED_FLY_SET = new Set<string>(FORTY_YD_NAMED_FLIES);

/** Sanitize day_splits: metric → positive yard/meter gate distances. */
export function sanitizeDaySplits(
  raw: unknown
): Record<string, number[]> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sanitized: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v) && v.every((n) => typeof n === "number" && n > 0)) {
      sanitized[k] = v as number[];
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Sanitize day_components. For 40yd_Dash, only named interval flies are kept
 * (5-10, 5-15, 10-20, 20-30, 20-40). Other metrics keep non-empty string labels.
 */
export function sanitizeDayComponents(
  raw: unknown
): Record<string, string[]> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sanitized: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const labels = v
      .filter((s): s is string => typeof s === "string" && s.trim() !== "")
      .map((s) => s.trim());
    if (labels.length === 0) continue;
    if (k === FORTY_YD_DASH) {
      const flies = labels.filter(
        (label) => isFortyYardComponent(label) && NAMED_FLY_SET.has(label)
      );
      if (flies.length > 0) sanitized[k] = flies;
    } else {
      sanitized[k] = labels;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}
