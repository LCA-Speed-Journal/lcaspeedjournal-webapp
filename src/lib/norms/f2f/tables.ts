import type { LookupPoint } from "./lookup";
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

export function broadPoints(): LookupPoint[] {
  return (broadJump.rows as BroadRow[]).map((row) => ({
    x: row.distance_ft,
    y: row.predicted_40,
  }));
}

export function forceMphPoints(): LookupPoint[] {
  return mphPoints(fly515.rows as FlyRow[]);
}

export function formMphPoints(split?: FormSplit): LookupPoint[] {
  if (split) return mphPoints(FORM_TABLES[split].rows);
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
