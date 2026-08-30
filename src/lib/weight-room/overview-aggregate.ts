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

export type WeightRoomOverview = {
  hugo_group: WeightRoomReport["hugo_group"];
  from: string;
  to: string;
  rosterCount: number;
  attendanceCount: number;
  attendanceByDate: WeightRoomReport["attendanceByDate"];
  bestLoads: OverviewBestLoad[];
  outputs: OverviewOutput[];
  noShows: ReportAthlete[];
  athletes: AthleteReportRow[];
};

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
    noShows,
    athletes: report.athletes,
  };
}
