import {
  classifyLiftName,
  LIFT_PATTERNS,
  type LiftId,
} from "@/lib/team-progress/headlines";

export type AthleteLiftLogRow = {
  session_date: string;
  movement_name: string;
  kind: string | null;
  load: number | null;
};

export type AthleteLiftPoint = { date: string; value: number };

export type AthleteLiftSeries = {
  lift_id: LiftId;
  label: string;
  units: "lb";
  points: AthleteLiftPoint[];
};

export function athleteLiftSeries(
  rows: AthleteLiftLogRow[]
): AthleteLiftSeries[] {
  const best = new Map<string, number>();

  for (const row of rows) {
    if (row.kind !== "load_reps") continue;
    if (row.load == null || !Number.isFinite(row.load)) continue;
    const liftId = classifyLiftName(row.movement_name);
    if (!liftId) continue;
    const key = `${liftId}\0${row.session_date}`;
    const prev = best.get(key);
    if (prev == null || row.load > prev) best.set(key, row.load);
  }

  const out: AthleteLiftSeries[] = [];
  for (const pattern of LIFT_PATTERNS) {
    const points: AthleteLiftPoint[] = [];
    for (const [key, value] of best) {
      if (!key.startsWith(`${pattern.id}\0`)) continue;
      const date = key.slice(pattern.id.length + 1);
      points.push({ date, value });
    }
    if (points.length === 0) continue;
    points.sort((a, b) => a.date.localeCompare(b.date));
    out.push({
      lift_id: pattern.id,
      label: pattern.label,
      units: "lb",
      points,
    });
  }
  return out;
}
