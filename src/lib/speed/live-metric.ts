import { ACCELERATION_KEY, BUILD_IN_KEY } from "./windows";

export type LiveMetricDef = {
  display_name: string;
  display_units: string;
};

type RegistryLike = Record<
  string,
  { display_name: string; display_units: string }
>;

export function liveMetricDef(metric: string, registry: RegistryLike): LiveMetricDef | null {
  if (metric === ACCELERATION_KEY) {
    return { display_name: ACCELERATION_KEY, display_units: "s" };
  }
  if (metric === BUILD_IN_KEY) {
    return { display_name: BUILD_IN_KEY, display_units: "mph" };
  }
  const entry = registry[metric];
  if (!entry) return null;
  return {
    display_name: entry.display_name,
    display_units: entry.display_units,
  };
}

export function leaderboardErrorMessage(
  body: unknown,
  statusText: string
): string {
  if (body != null && typeof body === "object" && "error" in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.length > 0) {
      return err;
    }
  }
  return statusText;
}