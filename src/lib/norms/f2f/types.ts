export type F2fEntry = {
  metric_key: string;
  component: string | null;
  display_value: number;
  session_date?: string;
};

export type F2fAthlete = {
  gender: string | null | undefined;
};

export type F2fQuality = "explosion" | "force" | "form";

export type F2fReferenceSource = "actual_40" | "projected";

export type F2fVertexInput = {
  metric_key: string;
  component: string | null;
  value: number;
  units: string;
};

export type F2fVertex = {
  predicted_40: number;
  extrapolated: boolean;
  projected: boolean;
  input?: F2fVertexInput;
  session_date?: string;
  mph?: number;
};

export type F2fProfile = {
  reference_40: number | null;
  reference_source: F2fReferenceSource | null;
  explosion: F2fVertex | null;
  force: F2fVertex | null;
  form: F2fVertex | null;
  eligible_for_labels: boolean;
  show_predicted_40s: boolean;
  flags: F2fQuality[];
  primary: F2fQuality | "balanced" | null;
};
