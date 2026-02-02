export type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number;
  created_at: string;
};

export type LeaderboardRow = {
  rank: number;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  display_value: number;
  units: string;
  source_metric_key?: string; // optional, for Max Velocity tooltip
};

export type ProgressionPoint = {
  session_date: string;
  display_value: number;
  units?: string;
};
