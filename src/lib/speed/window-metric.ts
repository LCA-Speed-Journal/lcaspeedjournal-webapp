import { ACCELERATION_KEY, BUILD_IN_KEY } from "./windows";

const COMPONENT_PATTERN = /^\d+(?:\.\d+)?-\d+(?:\.\d+)?(?:m|yd)$/;
const ALLOWED_KEYS = new Set<string>([ACCELERATION_KEY, BUILD_IN_KEY]);

export type WindowMetric = {
  metric_key: typeof ACCELERATION_KEY | typeof BUILD_IN_KEY;
  component: string;
};

export function formatWindowMetric(metricKey: string, component: string): string {
  return `window:${metricKey}:${component}`;
}

export function parseWindowMetric(value: string): WindowMetric | null {
  const prefix = "window:";
  if (!value.startsWith(prefix)) return null;
  const rest = value.slice(prefix.length);
  const splitAt = rest.indexOf(":");
  if (splitAt <= 0) return null;
  const metricKey = rest.slice(0, splitAt);
  const component = rest.slice(splitAt + 1);
  if (!ALLOWED_KEYS.has(metricKey) || !COMPONENT_PATTERN.test(component)) return null;
  return {
    metric_key: metricKey as WindowMetric["metric_key"],
    component,
  };
}
