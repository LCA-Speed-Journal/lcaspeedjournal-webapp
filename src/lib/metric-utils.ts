import { getMetricsRegistry } from "./parser";

export type MetricRegistry = ReturnType<typeof getMetricsRegistry>;

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
  return `0-${total}m`;
}
