type MetricDef = {
  input_structure: string;
  default_splits: (number | string)[];
};

export type MetricRegistry = Record<string, MetricDef>;

function primaryComponentForMetric(metricKey: string, reg: MetricRegistry): string | null {
  const metric = reg[metricKey];
  if (!metric || metric.input_structure !== "cumulative") return null;
  const nums = metric.default_splits.filter((s): s is number => typeof s === "number");
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return `0-${total}m`;
}

/**
 * Map a parent cumulative metric + 0→endM distance to a canonical registry key when it exists
 * (e.g. 20m_Accel + 10m → 10m_Accel). Returns null when no candidate key or parent pattern mismatch.
 */
export function resolveCanonicalZeroStartRow(
  parentMetricKey: string,
  endMeters: number,
  reg: MetricRegistry
): { metric_key: string; component: string | null } | null {
  const m = parentMetricKey.match(/^(\d+)m_(.+)$/);
  if (!m) return null;
  const candidate = `${endMeters}m_${m[2]}`;
  if (!reg[candidate]) return null;
  const def = reg[candidate];
  const primary =
    def.input_structure === "cumulative"
      ? primaryComponentForMetric(candidate, reg)
      : null;
  return { metric_key: candidate, component: primary };
}
