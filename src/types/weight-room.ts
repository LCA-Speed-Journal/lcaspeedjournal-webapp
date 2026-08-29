import type { HugoGroup, ScanStatus } from "@/lib/weight-room/constants";

export type AthleteHugoMembership = {
  athlete_id: string;
  hugo_group: HugoGroup;
  created_at: string;
};

export type AthleteSticker = {
  id: string;
  athlete_id: string;
  payload: string;
  active: boolean;
  created_at: string;
};

export type WorkoutTemplate = {
  id: string;
  hugo_group: HugoGroup;
  week_number: number | null;
  day_name: string | null;
  session_date: string;
  focus: string;
  title: string;
  layout: string;
  created_at: string;
};

export type WorkoutMovement = {
  id: string;
  template_id: string;
  sort_index: number;
  label: string | null;
  name: string;
  block: string;
  set_count: number;
  targets: string[];
  notes: string | null;
  from_pair: boolean;
};

export type CardScan = {
  id: string;
  blob_url: string;
  template_id: string | null;
  athlete_id: string | null;
  sticker_payload: string | null;
  status: ScanStatus;
  extraction: unknown | null;
  error: string | null;
  uploaded_at: string;
};

export type ScanListRow = CardScan & {
  first_name?: string | null;
  last_name?: string | null;
  template_title?: string | null;
};

export type SessionLog = {
  id: string;
  athlete_id: string;
  template_id: string;
  scan_id: string | null;
  session_date: string;
  hugo_group: HugoGroup;
  confirmed_at: string;
};

export type SetResult = {
  id: string;
  session_log_id: string;
  movement_id: string;
  set_index: number;
  raw_text: string | null;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
  corrected: boolean;
};

export type ParsedLoadReps = {
  raw: string;
  kind: "load_reps" | "bw" | "amrap" | "output" | "unknown";
  load: number | null;
  reps: number | null;
  units: string | null;
};
