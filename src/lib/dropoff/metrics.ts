import { isShortPracticeWindow, type DistanceUnit } from "@/lib/speed/windows";

const DROPOFF_METRIC_KEYS = new Set<string>([
  "5m_Accel",
  "10m_Accel",
  "15m_Accel",
  "20m_Accel",
  "10m_Light-Sled",
  "10m_Medium-Sled",
  "20m_Light-Sled",
  "20m_Medium-Sled",
  "10-20m_Split",
  "Vertical Jump",
  "Standing-Broad",
]);

export function isDropoffMetric(metricKey: string): boolean {
  return DROPOFF_METRIC_KEYS.has(metricKey);
}

export function isDropoffWindow(window: {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
}): boolean {
  return isShortPracticeWindow(window);
}
