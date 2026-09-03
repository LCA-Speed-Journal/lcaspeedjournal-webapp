export type F2fEntry = {
  metric_key: string;
  component: string | null;
  display_value: number;
};

export type F2fAthlete = {
  gender: string | null | undefined;
};

export type F2fQuality = "explosion" | "force" | "form";

export type F2fReferenceSource = "actual_40" | "projected";

export type F2fVertex = {
  predicted_40: number;
  extrapolated: boolean;
  projected: boolean;
};

export type F2fProfile = {
  reference_40: number | null;
  reference_source: F2fReferenceSource | null;
  explosion: F2fVertex | null;
  force: F2fVertex | null;
  form: F2fVertex | null;
  eligible_for_labels: boolean;
  flags: F2fQuality[];
  primary: F2fQuality | "balanced" | null;
};
