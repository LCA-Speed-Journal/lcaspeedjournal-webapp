import { getMetricsRegistry } from "./parser";

const MAX_VELOCITY_KEY = "MaxVelocity";

export function getMaxVelocityKey(): string {
  return MAX_VELOCITY_KEY;
}

export function getVelocityMetricKeys(): string[] {
  const registry = getMetricsRegistry();
  return Object.entries(registry)
    .filter(([, d]) => (d.display_units ?? "").toLowerCase() === "mph")
    .map(([k]) => k);
}

export function hasVelocityMetrics(): boolean {
  return getVelocityMetricKeys().length > 0;
}
