import { driBand, higherBoxFlag, peakBox } from "./dri";
import { rankFullField, type RankDirection } from "./rank";
import { batteryTotal } from "./slots";

export type BatteryMark = { athlete_id: string; key: string; value: number };

export type BatteryAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  dri_marks: { box: string; value: number }[];
};

export type ScoredCell = {
  value: number;
  rank: number;
  tied: boolean;
  points: number;
  band?: string;
};

export type ScoredBatteryRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  total_points: number;
  slots_completed: number;
  sprint_points: number;
  dri_band: string | null;
  dri_peak_box: string | null;
  higher_box: boolean;
  cells: Record<string, ScoredCell>;
};

const HIGHER_KEYS = new Set([
  "10-5_RSI",
  "DRI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
  "MaxVelocity",
]);

const LOWER_KEYS = new Set([
  "20yd_Dash",
  "40yd_Dash",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
]);

function directionFor(key: string): RankDirection | null {
  if (HIGHER_KEYS.has(key)) return "higher";
  if (LOWER_KEYS.has(key)) return "lower";
  return null;
}

function betterValue(direction: RankDirection, current: number, next: number): number {
  if (direction === "higher") return next > current ? next : current;
  return next < current ? next : current;
}

function teamBoxDri(athlete: BatteryAthlete, teamBox: string | null): number | null {
  if (teamBox == null) return null;
  let best: number | null = null;
  for (const mark of athlete.dri_marks) {
    if (mark.box !== teamBox) continue;
    best = best == null ? mark.value : Math.max(best, mark.value);
  }
  return best;
}

export function scoreBatteryRows(input: {
  athletes: BatteryAthlete[];
  marks: BatteryMark[];
  teamBox: string | null;
  poolIds?: string[];
}): ScoredBatteryRow[] {
  const pool = input.poolIds == null ? null : new Set(input.poolIds);
  const athletes =
    pool == null
      ? input.athletes
      : input.athletes.filter((athlete) => pool.has(athlete.athlete_id));
  const allowed = new Set(athletes.map((athlete) => athlete.athlete_id));

  const valuesByKey = new Map<string, Map<string, number>>();
  const put = (key: string, athleteId: string, value: number) => {
    const direction = directionFor(key);
    if (direction == null || !allowed.has(athleteId)) return;
    let byAthlete = valuesByKey.get(key);
    if (byAthlete == null) {
      byAthlete = new Map();
      valuesByKey.set(key, byAthlete);
    }
    const current = byAthlete.get(athleteId);
    byAthlete.set(
      athleteId,
      current == null ? value : betterValue(direction, current, value)
    );
  };

  for (const mark of input.marks) {
    if (mark.key === "DRI") continue;
    put(mark.key, mark.athlete_id, mark.value);
  }

  for (const athlete of athletes) {
    const dri = teamBoxDri(athlete, input.teamBox);
    if (dri != null) put("DRI", athlete.athlete_id, dri);
  }

  const rankedByKey = new Map<string, Map<string, ScoredCell>>();
  for (const [key, byAthlete] of valuesByKey) {
    const direction = directionFor(key);
    if (direction == null) continue;
    const ranked = rankFullField(
      [...byAthlete.entries()].map(([athlete_id, value]) => ({ athlete_id, value })),
      direction
    );
    const byId = new Map<string, ScoredCell>();
    for (const row of ranked) {
      const cell: ScoredCell = {
        value: row.value,
        rank: row.rank,
        tied: row.tied,
        points: row.points,
      };
      if (key === "DRI") cell.band = driBand(row.value).label;
      byId.set(row.athlete_id, cell);
    }
    rankedByKey.set(key, byId);
  }

  const rows = athletes.map((athlete) => {
    const cells: Record<string, ScoredCell> = {};
    const pointsByKey: Record<string, number> = {};
    for (const [key, byId] of rankedByKey) {
      const cell = byId.get(athlete.athlete_id);
      if (cell == null) continue;
      cells[key] = cell;
      pointsByKey[key] = cell.points;
    }
    const totals = batteryTotal(pointsByKey);
    const dri = teamBoxDri(athlete, input.teamBox);
    const driPeak = peakBox(athlete.dri_marks);
    return {
      athlete_id: athlete.athlete_id,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      total_points: totals.total_points,
      slots_completed: totals.slots_completed,
      sprint_points: totals.sprint_points,
      dri_band: dri == null ? null : driBand(dri).label,
      dri_peak_box: driPeak,
      higher_box: higherBoxFlag(driPeak, input.teamBox),
      cells,
    };
  });

  return rows.toSorted((a, b) => {
    if (a.total_points !== b.total_points) return b.total_points - a.total_points;
    if (a.slots_completed !== b.slots_completed) return b.slots_completed - a.slots_completed;
    const byLast = a.last_name.localeCompare(b.last_name);
    if (byLast !== 0) return byLast;
    const byFirst = a.first_name.localeCompare(b.first_name);
    if (byFirst !== 0) return byFirst;
    return a.athlete_id.localeCompare(b.athlete_id);
  });
}
