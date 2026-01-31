export type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number;
  created_at: string;
};

export type Session = {
  id: string;
  session_date: string;
  phase: string;
  phase_week: number;
  day_categories: unknown;
  day_metrics: unknown;
  day_splits: unknown;
  day_components: unknown;
  session_notes: string | null;
  created_at: string;
};
