import { isDropoffMetric, isDropoffWindow } from "@/lib/dropoff/metrics";
import type { DistanceUnit } from "@/lib/speed/windows";
import { getPrimaryComponent } from "@/lib/metric-utils";

export type DropoffWindow = {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
};

export type DropoffEntry = {
  id: string;
  athlete_id: string;
  metric_key: string;
  interval_index: number | null;
  component: string | null;
  display_value: number | string;
  units: string;
  created_at: string;
  distance_unit?: "m" | "yd" | null;
  start_distance?: number | null;
  end_distance?: number | null;
};

function sameDistance(actual: number | null | undefined, expected: number): boolean {
  if (actual == null) return false;
  return Number(actual) === Number(expected);
}

export function isOverallAttemptRow(entry: {
  metric_key: string;
  interval_index: number | null;
  component: string | null;
}): boolean {
  if (entry.interval_index != null) return false;
  if (entry.component == null || entry.component === "") return true;
  const primary = getPrimaryComponent(entry.metric_key);
  return primary != null && entry.component === primary;
}

/** Live leaderboard drop-off line: allowlisted metric, overall view only. */
export function isOverallDropoffView(
  metricKey: string,
  component: string | null,
  intervalIndex: number | null,
  window?: DropoffWindow
): boolean {
  if (window) return isDropoffWindow(window);
  if (!isDropoffMetric(metricKey)) return false;
  return isOverallAttemptRow({
    metric_key: metricKey,
    interval_index: intervalIndex,
    component,
  });
}

export function overallAttemptsFor(
  entries: DropoffEntry[],
  athleteId: string,
  metricKey: string,
  window?: DropoffWindow
): { units: string; values: number[] } | null {
  const rows = entries
    .filter((entry) => {
      if (entry.athlete_id !== athleteId || entry.metric_key !== metricKey) return false;
      if (window) {
        return (
          entry.distance_unit === window.distance_unit &&
          sameDistance(entry.start_distance, window.start_distance) &&
          sameDistance(entry.end_distance, window.end_distance)
        );
      }
      return isOverallAttemptRow(entry);
    })
    .slice()
    .sort((a, b) => {
      const byTime = a.created_at.localeCompare(b.created_at);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
  if (rows.length === 0) return null;
  return {
    units: rows[0].units,
    values: rows.map((row) => Number(row.display_value)),
  };
}
