export type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number | null;
  athlete_type: 'athlete' | 'staff' | 'alumni';
  active: boolean;
  created_at: string;
};

/** Session-to-session comparison: up = better, down = worse, neutral = within band */
export type LeaderboardTrend = "up" | "neutral" | "down";

export type LeaderboardRow = {
  rank: number;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  display_value: number;
  units: string;
  source_metric_key?: string; // optional, for Max Velocity tooltip
  // Session-to-session comparison (optional; absent when no prior session)
  previous_display_value?: number;
  previous_session_date?: string;
  percent_change?: number;
  trend?: LeaderboardTrend;
  /** PB = all-time best for this metric (+ component); SB = season best (calendar year), only when not PB */
  best_type?: "pb" | "sb";
};

export type ProgressionPoint = {
  session_date: string;
  display_value: number;
  units?: string;
};

// Phase A: Dashboard types
export type EventGroup = {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
};

export type SuperpowerPreset = {
  id: string;
  label: string;
  display_order: number;
  created_at: string;
};

export type KryptonitePreset = {
  id: string;
  label: string;
  display_order: number;
  created_at: string;
};

export type AthleteSuperpower = {
  id: string;
  athlete_id: string;
  preset_id: string | null;
  custom_text: string | null;
  detail: string | null;
  display_order: number;
  created_at: string;
};

export type AthleteKryptonite = {
  id: string;
  athlete_id: string;
  preset_id: string | null;
  custom_text: string | null;
  detail: string | null;
  display_order: number;
  created_at: string;
};

export type AthleteArchetype = {
  athlete_id: string;
  rsi_type: 'elastic' | 'force' | 'high_rsi' | 'low_rsi' | 'unset' | null;
  sprint_archetype: 'bouncer' | 'spinner' | 'bounder' | 'driver' | 'unset' | null;
  force_velocity_scale: number | null; // 1-5
  created_at: string;
  updated_at: string;
};

export type AthleteFlag = {
  id: string;
  athlete_id: string;
  flag_type: 'system' | 'coach';
  title: string;
  description: string | null;
  session_id: string | null;
  metric_key: string | null;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
};
