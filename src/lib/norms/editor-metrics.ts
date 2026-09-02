import metricsData from "@/lib/metrics.json";

type MetricDefLite = {
  display_name?: string;
  input_structure?: string;
  category?: string;
  display_units?: string;
};

const metrics = metricsData as Record<string, MetricDefLite>;

/** Intake metrics for the sport-defaults matrix (keep this list narrow). */
export const NORMS_DEFAULTS_METRIC_KEYS = [
  "Vertical Jump",
  "Standing-Broad",
  "40yd_Dash",
  "OH-MB_Throw",
  "UH-MB_Throw",
] as const;

export const FORTY_YD_DASH = "40yd_Dash";

export const TWENTY_YD_DASH = "20yd_Dash";

export const FORTY_YD_PRIMARY_COMPONENT = "0-40yd";

export const FORTY_YD_COMPONENTS = [
  "0-10yd",
  "0-20yd",
  "0-40yd",
  "10-20yd",
  "20-40yd",
  "0-5yd",
  "5-10yd",
] as const;

export function metricLabel(key: string): string {
  return metrics[key]?.display_name || key;
}

/** Editor default: named 0-40yd for 40yd_Dash; empty/none for every other metric. */
export function defaultCutsComponent(metric: string): string {
  return metric === FORTY_YD_DASH ? FORTY_YD_PRIMARY_COMPONENT : "";
}

export function cutsEditorMetrics(): { key: string; label: string }[] {
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];

  for (const key of NORMS_DEFAULTS_METRIC_KEYS) {
    if (!(key in metrics)) continue;
    seen.add(key);
    out.push({ key, label: metricLabel(key) });
  }

  const extras = Object.entries(metrics)
    .filter(([key, def]) => {
      if (seen.has(key)) return false;
      if (def.input_structure !== "single_interval") return false;
      if (def.category === "Lactic") return false;
      if (def.display_units === "mph") return false;
      return true;
    })
    .map(([key, def]) => ({ key, label: def.display_name || key }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...out, ...extras];
}
