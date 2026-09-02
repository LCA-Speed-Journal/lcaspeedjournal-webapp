import {
  AGILITY_5105,
  AGILITY_5105_PRIMARY_COMPONENTS,
  getPrimaryComponent,
} from "./metric-utils";
import { getMetricsRegistry } from "./parser";

export type HistoricalComponentFilter = {
  primary: string | null;
  allowNullComponent: boolean;
  allowedComponents: string[] | null;
};

export function getHistoricalComponentFilter(
  metricKey: string
): HistoricalComponentFilter {
  if (metricKey === AGILITY_5105) {
    return {
      primary: null,
      allowNullComponent: false,
      allowedComponents: [...AGILITY_5105_PRIMARY_COMPONENTS],
    };
  }
  const registry = getMetricsRegistry();
  const primary = getPrimaryComponent(metricKey, registry);
  if (primary == null) {
    return { primary: null, allowNullComponent: false, allowedComponents: null };
  }
  return { primary, allowNullComponent: true, allowedComponents: null };
}
