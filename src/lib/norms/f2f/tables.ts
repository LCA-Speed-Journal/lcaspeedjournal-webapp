import { fitSlowTail, type LookupPoint, type SlowTailFit } from "./lookup";
import broadJump from "./tables/broad-jump.json";
import fly515 from "./tables/fly-5-15.json";
import fly2040 from "./tables/fly-20-40.json";
import fly2030 from "./tables/fly-20-30.json";
import fly3040 from "./tables/fly-30-40.json";

export type FormSplit = "20-40yd" | "20-30yd" | "30-40yd";

type BroadRow = { distance_ft: number; predicted_40: number };
type FlyRow = { time_s: number; mph: number; predicted_40: number };

const FORM_TABLES: Record<FormSplit, { rows: FlyRow[] }> = {
  "20-40yd": fly2040,
  "20-30yd": fly2030,
  "30-40yd": fly3040,
};

const FORM_SPLIT_PREFERENCE: FormSplit[] = ["20-40yd", "20-30yd", "30-40yd"];

function mphPoints(rows: FlyRow[]): LookupPoint[] {
  return rows.map((row) => ({ x: row.mph, y: row.predicted_40 }));
}

function combinedFormMphPoints(): LookupPoint[] {
  const byMph = new Map<number, LookupPoint>();
  for (const preferred of FORM_SPLIT_PREFERENCE) {
    for (const row of FORM_TABLES[preferred].rows) {
      if (!byMph.has(row.mph)) {
        byMph.set(row.mph, { x: row.mph, y: row.predicted_40 });
      }
    }
  }
  return [...byMph.values()];
}

const BROAD_POINTS: LookupPoint[] = (broadJump.rows as BroadRow[]).map((row) => ({
  x: row.distance_ft,
  y: row.predicted_40,
}));

const FORCE_MPH_POINTS: LookupPoint[] = mphPoints(fly515.rows as FlyRow[]);
const FORCE_TIME_POINTS: LookupPoint[] = (fly515.rows as FlyRow[]).map((row) => ({
  x: row.time_s,
  y: row.predicted_40,
}));

const FORM_MPH_POINTS: Record<FormSplit, LookupPoint[]> = {
  "20-40yd": mphPoints(FORM_TABLES["20-40yd"].rows),
  "20-30yd": mphPoints(FORM_TABLES["20-30yd"].rows),
  "30-40yd": mphPoints(FORM_TABLES["30-40yd"].rows),
};

const FORM_MPH_COMBINED: LookupPoint[] = combinedFormMphPoints();

export const broadSlowFit: SlowTailFit | null = fitSlowTail(BROAD_POINTS);
export const forceMphSlowFit: SlowTailFit | null = fitSlowTail(FORCE_MPH_POINTS);
export const forceTimeSlowFit: SlowTailFit | null = fitSlowTail(FORCE_TIME_POINTS);

const FORM_MPH_FITS: Record<FormSplit, SlowTailFit | null> = {
  "20-40yd": fitSlowTail(FORM_MPH_POINTS["20-40yd"]),
  "20-30yd": fitSlowTail(FORM_MPH_POINTS["20-30yd"]),
  "30-40yd": fitSlowTail(FORM_MPH_POINTS["30-40yd"]),
};

const FORM_MPH_COMBINED_FIT: SlowTailFit | null = fitSlowTail(FORM_MPH_COMBINED);

export function broadPoints(): LookupPoint[] {
  return BROAD_POINTS;
}

export function forceMphPoints(): LookupPoint[] {
  return FORCE_MPH_POINTS;
}

export function forceTimePoints(): LookupPoint[] {
  return FORCE_TIME_POINTS;
}

export function formMphPoints(split?: FormSplit): LookupPoint[] {
  if (split) return FORM_MPH_POINTS[split];
  return FORM_MPH_COMBINED;
}

export function formMphSlowFit(split?: FormSplit): SlowTailFit | null {
  if (split) return FORM_MPH_FITS[split];
  return FORM_MPH_COMBINED_FIT;
}
