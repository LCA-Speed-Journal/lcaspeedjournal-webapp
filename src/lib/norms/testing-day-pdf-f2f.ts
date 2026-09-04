import type { F2fThemeMix, F2fThemePrimary } from "./f2f/themes";
import type { F2fProfile, F2fQuality } from "./f2f/types";

export const F2F_FOCUS_COLORS = {
  explosion: "#dc2626",
  force: "#ea580c",
  form: "#ca8a04",
} as const;

export const F2F_STRENGTH_BG = "#bbf7d0";
export const F2F_DEFICIENCY_BG = "#fecaca";

export const F2F_PIE_COLORS = {
  balanced: "#64748b",
  explosion: "#dc2626",
  force: "#ea580c",
  form: "#ca8a04",
} as const;

const QUALITIES: F2fQuality[] = ["explosion", "force", "form"];

const FOCUS_TEXT: Record<F2fQuality, string> = {
  explosion: "Develop Explosion",
  force: "Develop Force",
  form: "Develop Top-End",
};

const PIE_SLICES: { key: F2fThemePrimary; label: string }[] = [
  { key: "balanced", label: "Balanced" },
  { key: "explosion", label: "Explosion-deficient" },
  { key: "force", label: "Force-deficient" },
  { key: "form", label: "Form-deficient" },
];

export type F2fPaint = "strength" | "deficiency" | null;

export type F2fStrengthMap = Record<F2fQuality, F2fPaint>;

export type F2fFocusBadge = {
  text: string;
  tone: F2fQuality;
};

export type F2fPieSlice = {
  key: F2fThemePrimary;
  label: string;
  count: number;
  percent: number;
};

function emptyStrengthMap(): F2fStrengthMap {
  return { explosion: null, force: null, form: null };
}

export function f2fStrengthDeficiency(profile: F2fProfile): F2fStrengthMap {
  const result = emptyStrengthMap();
  const filled: { key: F2fQuality; value: number }[] = [];

  for (const key of QUALITIES) {
    const predicted = profile[key]?.predicted_40;
    if (typeof predicted === "number" && Number.isFinite(predicted)) {
      filled.push({ key, value: predicted });
    }
  }

  if (filled.length === 0) return result;

  const min = Math.min(...filled.map((entry) => entry.value));
  const max = Math.max(...filled.map((entry) => entry.value));
  if (min === max) return result;

  for (const { key, value } of filled) {
    if (value === min) result[key] = "strength";
    else if (value === max) result[key] = "deficiency";
  }

  return result;
}

export function f2fFocusBadge(
  profile: F2fProfile | undefined
): F2fFocusBadge | null {
  if (!profile?.eligible_for_labels) return null;
  const primary = profile.primary;
  if (primary !== "explosion" && primary !== "force" && primary !== "form") {
    return null;
  }
  return { text: FOCUS_TEXT[primary], tone: primary };
}

export function f2fPieSlices(
  mix: F2fThemeMix,
  eligibleCount: number
): F2fPieSlice[] {
  if (eligibleCount === 0) return [];

  const slices: F2fPieSlice[] = [];
  for (const { key, label } of PIE_SLICES) {
    const count = mix[key];
    if (count === 0) continue;
    slices.push({
      key,
      label,
      count,
      percent: Math.round((count / eligibleCount) * 100),
    });
  }
  return slices;
}
