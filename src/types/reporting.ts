/** Response shape for GET /api/reporting/summary */
export type ReportingMetricAgg = {
  metric_key: string;
  metric_label: string;
  n: number;
  min: number;
  max: number;
  avg: number;
  median: number;
};

export type ReportingAthleteSummary = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number | null;
  athlete_type: string;
  entry_count: number;
  session_count: number;
  metrics: ReportingMetricAgg[];
};

export type ReportingTopPerformer = {
  rank: number;
  athlete_id: string;
  first_name: string;
  last_name: string;
  athlete_type: string;
  metric_count: number;
  avg_percentile_rank: number; // 0..1, higher is better
};

export type ReportingSummaryData = {
  from: string;
  to: string;
  team: {
    session_count: number;
    athlete_count: number;
    entry_count: number;
    metrics: ReportingMetricAgg[];
  };
  athletes: ReportingAthleteSummary[];
  top_performers: ReportingTopPerformer[];
};
