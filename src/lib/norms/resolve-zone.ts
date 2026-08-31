import { ZONE_COLORS, zoneRank, type ZoneLabel } from "./palette";

export type ZoneCut = { label: ZoneLabel; threshold: number };

export type ZoneHit = { label: ZoneLabel; color: string };

export function resolveZone(input: {
  value: number;
  lowerIsBetter: boolean;
  cuts: ZoneCut[];
}): ZoneHit | null {
  if (!Number.isFinite(input.value)) return null;
  const cuts = input.cuts.filter((c) => Number.isFinite(c.threshold));
  if (cuts.length === 0) return null;

  const earned: ZoneLabel[] = [];
  for (const cut of cuts) {
    const ok = input.lowerIsBetter
      ? input.value <= cut.threshold
      : input.value >= cut.threshold;
    if (ok) earned.push(cut.label);
  }
  if (earned.length === 0) return null;

  let best = earned[0];
  for (const label of earned) {
    if (zoneRank(label) > zoneRank(best)) best = label;
  }
  return { label: best, color: ZONE_COLORS[best] };
}
