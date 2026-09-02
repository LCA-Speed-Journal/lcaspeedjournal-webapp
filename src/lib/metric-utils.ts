import { getMetricsRegistry } from "./parser";

export type MetricRegistry = ReturnType<typeof getMetricsRegistry>;

/**
 * Interval unit for split labels (`"m"` | `"yd"`). Defaults to `"m"` when omitted or unknown.
 */
export function getIntervalUnit(
  metricKey: string,
  registry?: MetricRegistry
): "m" | "yd" {
  const reg = registry ?? getMetricsRegistry();
  const metric = reg[metricKey];
  return metric?.interval_unit === "yd" ? "yd" : "m";
}

/**
 * Returns the primary (full-run) component for a cumulative metric, e.g. "0-20m" for 20m_Accel.
 * Returns null for non-cumulative, unknown, or invalid metrics.
 */
export function getPrimaryComponent(
  metricKey: string,
  registry?: MetricRegistry
): string | null {
  const reg = registry ?? getMetricsRegistry();
  const metric = reg[metricKey];
  if (!metric || metric.input_structure !== "cumulative") return null;
  const splits = metric.default_splits;
  if (!Array.isArray(splits)) return null;
  const nums = splits.filter((s): s is number => typeof s === "number");
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const unit = getIntervalUnit(metricKey, reg);
  return `0-${total}${unit}`;
}

export const AGILITY_5105 = "5-10-5_Agility";

export const AGILITY_5105_PRIMARY_COMPONENTS = [
  "Average",
  "Athlete-Comfort",
] as const;

export function isAgility5105PrimaryComponent(
  component: string | null | undefined
): boolean {
  return component === "Average" || component === "Athlete-Comfort";
}

/**
 * True when the component is the overall/primary result for the metric
 * (5-10-5 Average or Athlete-Comfort, cumulative full-run split, or any
 * row when there is no cumulative primary — same as the old PR keep-all
 * rule, so ISO L/R rows are kept).
 */
export function isPrimaryResultComponent(
  metricKey: string,
  component: string | null | undefined,
  registry?: MetricRegistry
): boolean {
  if (metricKey === AGILITY_5105) {
    return isAgility5105PrimaryComponent(component);
  }
  const primary = getPrimaryComponent(metricKey, registry);
  if (primary == null) {
    return true;
  }
  return component === primary || component == null || component === "";
}

/**
 * Returns a display label for an entry row: metric_key alone or "metric_key (component)".
 */
export function formatEntryMetricLabel(
  row: { metric_key: string; component: string | null },
  _registry?: MetricRegistry
): string {
  if (row.component != null && row.component.trim() !== "") {
    return `${row.metric_key} (${row.component})`;
  }
  return row.metric_key;
}
