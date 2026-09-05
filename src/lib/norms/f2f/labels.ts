import type { F2fQuality, F2fVertex } from "./types";

const QUALITY_NAME: Record<F2fQuality | "balanced", string> = {
  explosion: "Explosion",
  force: "Force",
  form: "Form",
  balanced: "Balanced",
};

export function f2fChipLabel(quality: F2fQuality | "balanced"): string {
  if (quality === "balanced") return QUALITY_NAME.balanced;
  return `${QUALITY_NAME[quality]}-deficient`;
}

export function f2fShowsPredicted40s(
  profile: { show_predicted_40s?: boolean } | null | undefined
): boolean {
  return Boolean(profile?.show_predicted_40s);
}

export function formatQualityMark(
  vertex: F2fVertex | null | undefined,
  composed: boolean
): string {
  if (!vertex || !Number.isFinite(vertex.predicted_40)) return "—";
  const mark = vertex.predicted_40.toFixed(2);
  if (composed && vertex.session_date) return `${mark} · ${vertex.session_date}`;
  return mark;
}
