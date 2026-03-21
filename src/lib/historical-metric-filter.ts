import { getPrimaryComponent } from "./metric-utils";
import { getMetricsRegistry } from "./parser";

export type HistoricalComponentFilter = {
  primary: string | null;
  allowNullComponent: boolean;
};

export function getHistoricalComponentFilter(metricKey: string): HistoricalComponentFilter {
  const registry = getMetricsRegistry();
  const primary = getPrimaryComponent(metricKey, registry);
  if (primary == null) return { primary: null, allowNullComponent: false };
  return { primary, allowNullComponent: true };
}
