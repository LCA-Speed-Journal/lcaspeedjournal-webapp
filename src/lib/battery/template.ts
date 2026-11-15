export const BATTERY_TEMPLATES = [
  { id: "boys_basketball_baseline", label: "Boys Basketball Baseline" },
] as const;

export type BatteryTemplateId = (typeof BATTERY_TEMPLATES)[number]["id"];

export const BOYS_BASKETBALL_BASELINE = {
  title: "Boys Basketball Baseline",
  hugo_group: "mens_basketball",
  grouping_mode: "cutoff" as const,
  cutoff_n: 18,
  senior_grad_year: 2027,
  comparison_date: "2026-09-02",
  comparison_hugo_group: "soccer",
  days: [
    {
      day_key: "A",
      label: "Rate and Reactivity",
      session_date: "2026-11-16",
      sort_order: 1,
      rest_seconds: null as number | null,
      metric_keys: ["10-5_RSI", "40yd_Dash", "DRI"],
    },
    {
      day_key: "B",
      label: "Upper Body",
      session_date: "2026-11-17",
      sort_order: 2,
      rest_seconds: null as number | null,
      metric_keys: ["OH-MB_Throw", "Bench-Press"],
    },
    {
      day_key: "C",
      label: "Power",
      session_date: "2026-11-19",
      sort_order: 3,
      rest_seconds: null as number | null,
      metric_keys: ["Vertical Jump", "Standing-Broad"],
    },
    {
      day_key: "D",
      label: "Capacity",
      session_date: "2026-11-20",
      sort_order: 4,
      rest_seconds: 10 as number | null,
      metric_keys: ["10x10m", "Hex-Deadlift"],
    },
  ],
};
