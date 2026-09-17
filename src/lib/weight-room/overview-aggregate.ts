import type {
  AthleteReportRow,
  ReportAthlete,
  ReportOutputRow,
  WeightRoomReport,
} from "./report-aggregate";

export type OverviewBestLoad = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  load: number;
};

export type OverviewOutput = ReportOutputRow & {
  athlete_id: string;
  first_name: string;
  last_name: string;
};

export type OverviewOutputGroup = {
  /** Stable group key (drill label or movement name). */
  key: string;
  label: string;
  units: string | null;
  higherIsBetter: boolean;
  rows: OverviewOutput[];
};

export type WeightRoomOverview = {
  hugo_group: WeightRoomReport["hugo_group"];
  from: string;
  to: string;
  rosterCount: number;
  attendanceCount: number;
  attendanceByDate: WeightRoomReport["attendanceByDate"];
  bestLoads: OverviewBestLoad[];
  outputs: OverviewOutput[];
  /** Outputs bucketed by metric/drill, ranked best → worst within each. */
  outputGroups: OverviewOutputGroup[];
  noShows: ReportAthlete[];
  athletes: AthleteReportRow[];
};

const HIGHER_IS_BETTER_UNITS = new Set([
  "mph",
  "in",
  "inch",
  "inches",
  '"',
  "ft",
  "cm",
  "m",
  "lb",
  "lbs",
  "kg",
]);

const LOWER_IS_BETTER_UNITS = new Set(["s", "sec", "secs", "ms"]);

export function outputHigherIsBetter(units: string | null | undefined): boolean {
  const u = (units ?? "").trim().toLowerCase();
  if (LOWER_IS_BETTER_UNITS.has(u)) return false;
  if (HIGHER_IS_BETTER_UNITS.has(u)) return true;
  // Default: treat as a mark where bigger is better (loads, jumps, mph-converted).
  return true;
}

function outputGroupKey(row: OverviewOutput): string {
  return (row.drill_label ?? row.movement_name).trim() || "Output";
}

function compareOutputBestFirst(
  a: OverviewOutput,
  b: OverviewOutput,
  higherIsBetter: boolean
): number {
  const aLoad = a.load;
  const bLoad = b.load;
  if (aLoad == null && bLoad == null) {
    return a.last_name.localeCompare(b.last_name);
  }
  if (aLoad == null) return 1;
  if (bLoad == null) return -1;
  const diff = higherIsBetter ? bLoad - aLoad : aLoad - bLoad;
  if (diff !== 0) return diff;
  return a.last_name.localeCompare(b.last_name);
}

/** Group flat outputs by metric/drill and rank athletes best → worst. */
export function groupOverviewOutputs(
  outputs: OverviewOutput[]
): OverviewOutputGroup[] {
  const byKey = new Map<string, OverviewOutput[]>();
  for (const row of outputs) {
    const key = outputGroupKey(row);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const groups: OverviewOutputGroup[] = [];
  for (const [key, rows] of byKey) {
    const units = rows.find((r) => r.units)?.units ?? rows[0]?.units ?? null;
    const higherIsBetter = outputHigherIsBetter(units);
    const ranked = [...rows].sort((a, b) =>
      compareOutputBestFirst(a, b, higherIsBetter)
    );
    groups.push({
      key,
      label: key,
      units,
      higherIsBetter,
      rows: ranked,
    });
  }

  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}

export function buildWeightRoomOverview(
  report: WeightRoomReport,
  roster: ReportAthlete[]
): WeightRoomOverview {
  const present = new Set(report.athletes.map((a) => a.athlete_id));
  const noShows = roster
    .filter((a) => !present.has(a.id))
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const bestLoads = report.athletes
    .filter((a) => a.bestLoad != null)
    .map((a) => ({
      athlete_id: a.athlete_id,
      first_name: a.first_name,
      last_name: a.last_name,
      load: a.bestLoad as number,
    }))
    .sort((a, b) => b.load - a.load);
  const outputs = report.athletes.flatMap((a) =>
    a.outputs.map((o) => ({
      ...o,
      athlete_id: a.athlete_id,
      first_name: a.first_name,
      last_name: a.last_name,
    }))
  );
  return {
    hugo_group: report.hugo_group,
    from: report.from,
    to: report.to,
    rosterCount: roster.length,
    attendanceCount: report.athletes.length,
    attendanceByDate: report.attendanceByDate,
    bestLoads,
    outputs,
    outputGroups: groupOverviewOutputs(outputs),
    noShows,
    athletes: report.athletes,
  };
}
