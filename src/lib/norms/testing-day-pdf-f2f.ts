import { f2fShowsPredicted40s } from "./f2f/labels";
import type { F2fThemeMix, F2fThemePrimary, F2fThemeSummary } from "./f2f/themes";
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

export const ZONE_ABBREVS: Record<
  "efficient" | "advanced" | "elite" | "world-class",
  string
> = {
  efficient: "EFF",
  advanced: "ADV",
  elite: "E",
  "world-class": "WC",
};

export const ZONE_ABBREV_LEGEND =
  "EFF Efficient · ADV Advanced · E Elite · WC World-class";

export function zoneAbbrev(label: string | undefined): string | null {
  if (label === "efficient") return ZONE_ABBREVS.efficient;
  if (label === "advanced") return ZONE_ABBREVS.advanced;
  if (label === "elite") return ZONE_ABBREVS.elite;
  if (label === "world-class") return ZONE_ABBREVS["world-class"];
  return null;
}

export function fmtPdfTableMark(
  value: number,
  _units: string | null | undefined,
  zoneLabel?: string
): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2);
  const abbrev = zoneAbbrev(zoneLabel);
  return abbrev ? `${n} \u2014 ${abbrev}` : n;
}

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
  { key: "form", label: "Top-End-deficient" },
];

export const PDF_F2F_QUALITY_LABELS: Record<F2fQuality, string> = {
  explosion: "Explosion",
  force: "Force",
  form: "Top-End",
};

export function pdfCoachF2fCopy(text: string): string {
  return text
    .replaceAll("Force-to-Form", "\u0000")
    .replace(/\bForm\b/g, "Top-End")
    .replaceAll("\u0000", "Force-to-Form");
}

export function coachF2fPdfNote(
  session: F2fThemeSummary | undefined,
  group: F2fThemeSummary | undefined
): string | null {
  const groupOverridden =
    group != null && group.note.trim() !== group.generated_note.trim();
  if (groupOverridden) return group.note.trim();
  const sessionOverridden =
    session != null && session.note.trim() !== session.generated_note.trim();
  if (sessionOverridden) return session.note.trim();
  const fallback = group?.note.trim() || session?.note.trim();
  return fallback ? fallback : null;
}

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

export function f2fCardHeading(
  name: string,
  profile: F2fProfile | null | undefined
): string {
  if (
    f2fShowsPredicted40s(profile) &&
    profile?.reference_40 != null &&
    Number.isFinite(profile.reference_40)
  ) {
    return `${name}: ${profile.reference_40.toFixed(2)} 40yd`;
  }
  return name;
}

export function f2fCardSprintSubline(
  profile: F2fProfile | null | undefined,
  twentyYd: number | null | undefined
): string | null {
  if (f2fShowsPredicted40s(profile)) return null;
  if (twentyYd == null || !Number.isFinite(twentyYd)) return null;
  return `${twentyYd.toFixed(2)} 20yd`;
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

function piePoint(
  cx: number,
  cy: number,
  r: number,
  frac: number
): { x: number; y: number } {
  const angle = frac * 2 * Math.PI - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function fmtPieCoord(value: number): string {
  return value.toFixed(4);
}

export function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  startFrac: number,
  endFrac: number
): string {
  const start = piePoint(cx, cy, r, startFrac);
  const sweep = endFrac - startFrac;
  const move = `M ${fmtPieCoord(cx)} ${fmtPieCoord(cy)} L ${fmtPieCoord(start.x)} ${fmtPieCoord(start.y)}`;

  if (sweep >= 1 - 1e-9) {
    const mid = piePoint(cx, cy, r, startFrac + 0.5);
    return `${move} A ${fmtPieCoord(r)} ${fmtPieCoord(r)} 0 1 1 ${fmtPieCoord(mid.x)} ${fmtPieCoord(mid.y)} A ${fmtPieCoord(r)} ${fmtPieCoord(r)} 0 1 1 ${fmtPieCoord(start.x)} ${fmtPieCoord(start.y)} Z`;
  }

  const end = piePoint(cx, cy, r, endFrac);
  const largeArc = sweep > 0.5 ? 1 : 0;
  return `${move} A ${fmtPieCoord(r)} ${fmtPieCoord(r)} 0 ${largeArc} 1 ${fmtPieCoord(end.x)} ${fmtPieCoord(end.y)} Z`;
}
