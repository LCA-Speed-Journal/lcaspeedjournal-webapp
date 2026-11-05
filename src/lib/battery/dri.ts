export const DRI_BOXES = ["6", "12", "18", "24"] as const;
export type DriBox = (typeof DRI_BOXES)[number];

export type DriBand = { key: string; label: string };

export function driBand(value: number): DriBand {
  if (value < 0.5) return { key: "warming_up", label: "Warming Up" };
  if (value < 1.25) return { key: "rebound_ready", label: "Rebound Ready" };
  if (value < 2) return { key: "pretty_springy", label: "Pretty Springy" };
  if (value <= 3) return { key: "bouncy", label: "Bouncy" };
  return { key: "elite", label: "Elite" };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

const MEDIAN_TIE_EPSILON = 1e-9;

export function pickTeamDriBox(
  marks: { box: string; value: number }[]
): DriBox | null {
  let best: { box: DriBox; median: number } | null = null;
  for (const box of DRI_BOXES) {
    const med = median(marks.filter((mark) => mark.box === box).map((mark) => mark.value));
    if (med == null) continue;
    if (!best) {
      best = { box, median: med };
      continue;
    }
    const tied = Math.abs(med - best.median) <= MEDIAN_TIE_EPSILON;
    if ((!tied && med > best.median) || (tied && Number(box) < Number(best.box))) {
      best = { box, median: med };
    }
  }
  return best?.box ?? null;
}

export function higherBoxFlag(
  peakBox: string | null,
  teamBox: string | null
): boolean {
  if (peakBox == null || teamBox == null) return false;
  return Number(peakBox) > Number(teamBox);
}

export function peakBox(
  marks: { box: string; value: number }[]
): string | null {
  let best: { box: string; value: number } | null = null;
  for (const mark of marks) {
    if (!best || mark.value > best.value) best = mark;
  }
  return best?.box ?? null;
}
