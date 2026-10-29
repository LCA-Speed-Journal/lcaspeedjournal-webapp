import { ACCELERATION_KEY, BUILD_IN_KEY, type DistanceUnit } from "./windows";

export type SpeedWindowRow = {
  session_id: string;
  metric_key: string;
  component: string;
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
};

export function windowIdentity(row: SpeedWindowRow): string {
  return `${row.session_id}|${row.distance_unit}|${row.start_distance}|${row.end_distance}`;
}

export function spanningBuildInKeys(rows: SpeedWindowRow[]): Set<string> {
  const bySessionUnit = new Map<string, SpeedWindowRow[]>();
  for (const row of rows) {
    if (row.metric_key !== ACCELERATION_KEY && row.metric_key !== BUILD_IN_KEY) continue;
    const key = `${row.session_id}|${row.distance_unit}`;
    const list = bySessionUnit.get(key);
    if (list) list.push(row);
    else bySessionUnit.set(key, [row]);
  }
  const spanning = new Set<string>();
  for (const group of bySessionUnit.values()) {
    for (const row of group) {
      if (row.metric_key !== BUILD_IN_KEY) continue;
      const contains = group.some(
        (other) =>
          other !== row &&
          other.start_distance >= row.start_distance &&
          other.end_distance <= row.end_distance &&
          (other.start_distance !== row.start_distance ||
            other.end_distance !== row.end_distance)
      );
      if (contains) spanning.add(windowIdentity(row));
    }
  }
  return spanning;
}
