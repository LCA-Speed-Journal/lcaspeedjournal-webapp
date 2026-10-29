import { velocityMph } from "@/lib/conversions";

export const ACCELERATION_KEY = "Acceleration";
export const BUILD_IN_KEY = "BuildIn";
const YARDS_TO_METERS = 0.9144;

export type DistanceUnit = "m" | "yd";

export type SpeedWindow = {
  metric_key: typeof ACCELERATION_KEY | typeof BUILD_IN_KEY;
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
  component: string;
};

export type SpeedRunRow = SpeedWindow & {
  value: number;
  display_value: number;
  units: "s" | "mph";
  interval_index: null;
};

export type SpeedRunInput = {
  distanceUnit: DistanceUnit;
  untimedBuild: number;
  gates: number[];
  cumulativeTimes: number[];
};

const LEGACY_SPEED_KEYS = new Set([
  "5m_Accel",
  "10m_Accel",
  "15m_Accel",
  "20m_Accel",
  "30m_Accel",
  "5-10m_Split",
  "5-15m_Split",
  "10-20m_Split",
  "20-30m_Split",
  "10-30m_Split",
  "20-40m_Split",
  "30-50m_Split",
  "40-60m_Split",
  "30-40m_Split",
  "40-50m_Split",
  "30-45m_Split",
  "45-55m_Split",
  "40m_Sprint",
  "50m_Sprint",
  "20yd_Dash",
  "40yd_Dash",
]);

export function flyDistance(start: number, end: number): number {
  return end - start;
}

export function distanceMeters(distance: number, unit: DistanceUnit): number {
  return unit === "yd" ? distance * YARDS_TO_METERS : distance;
}

export function mphForWindow(fly: number, unit: DistanceUnit, timeS: number): number {
  return velocityMph(distanceMeters(fly, unit), timeS);
}

export function timeFromMph(fly: number, unit: DistanceUnit, mph: number): number {
  if (mph <= 0) throw new Error("Cannot recover a time from a non-positive mph");
  return (distanceMeters(fly, unit) * 2.237) / mph;
}

export function windowLabel(start: number, end: number, unit: DistanceUnit): string {
  return `${start}-${end}${unit}`;
}

export function isShortPracticeWindow(window: {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
}): boolean {
  const { start_distance: start, end_distance: end } = window;
  if (start === 0 && (end === 5 || end === 10 || end === 15 || end === 20)) return true;
  return start === 10 && end === 20;
}

function asWindow(unit: DistanceUnit, start: number, end: number): SpeedWindow {
  if (end <= start) throw new Error(`Window end ${end} must be past start ${start}`);
  const metric_key = start === 0 ? ACCELERATION_KEY : BUILD_IN_KEY;
  return {
    metric_key,
    distance_unit: unit,
    start_distance: start,
    end_distance: end,
    component: windowLabel(start, end, unit),
  };
}

function rowFromTime(window: SpeedWindow, timeS: number): SpeedRunRow {
  if (!(timeS > 0)) throw new Error("Window time must be positive");
  if (window.metric_key === ACCELERATION_KEY) {
    return { ...window, value: timeS, display_value: timeS, units: "s", interval_index: null };
  }
  const fly = flyDistance(window.start_distance, window.end_distance);
  return {
    ...window,
    value: timeS,
    display_value: mphForWindow(fly, window.distance_unit, timeS),
    units: "mph",
    interval_index: null,
  };
}

export function expandSpeedRun(input: SpeedRunInput): SpeedRunRow[] {
  const { distanceUnit, untimedBuild, gates, cumulativeTimes } = input;
  if (untimedBuild < 0) throw new Error("Untimed build cannot be negative");
  if (gates.length === 0) throw new Error("A speed run needs at least one gate");
  if (gates.length !== cumulativeTimes.length) {
    throw new Error("Gate count does not match time count");
  }
  const points = [{ distance: untimedBuild, time: 0 }];
  for (let i = 0; i < gates.length; i++) {
    const distance = gates[i];
    const time = cumulativeTimes[i];
    const prev = points[points.length - 1];
    if (!(distance > prev.distance)) {
      throw new Error(`Gate ${distance} must be past the build and in order`);
    }
    if (!(time > prev.time)) throw new Error("Times must increase at each gate");
    points.push({ distance, time });
  }
  const rows: SpeedRunRow[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const start = points[i].distance;
      const end = points[j].distance;
      if (untimedBuild > 0 && start === 0) continue;
      rows.push(rowFromTime(asWindow(distanceUnit, start, end), points[j].time - points[i].time));
    }
  }
  return rows;
}

function unitForKey(metricKey: string): DistanceUnit {
  return metricKey === "20yd_Dash" || metricKey === "40yd_Dash" ? "yd" : "m";
}

export function classifyLegacySpeedRow(row: {
  metric_key: string;
  component: string | null;
}): SpeedWindow | null {
  if (!LEGACY_SPEED_KEYS.has(row.metric_key)) return null;
  const component = row.component?.trim() ?? "";
  const labeled = component.match(/^(\d+)-(\d+)(m|yd)?$/);
  if (labeled) {
    const unit = (labeled[3] as DistanceUnit | undefined) ?? unitForKey(row.metric_key);
    return asWindow(unit, Number(labeled[1]), Number(labeled[2]));
  }
  const accel = row.metric_key.match(/^(\d+)m_Accel$/);
  if (accel) return asWindow("m", 0, Number(accel[1]));
  const split = row.metric_key.match(/^(\d+)-(\d+)m_Split$/);
  if (split) return asWindow("m", Number(split[1]), Number(split[2]));
  return null;
}

export type SpeedAlias = {
  legacy_metric_key: string;
  legacy_component: string;
};

const ACCEL_ENDS_M = [5, 10, 15, 20, 30];

/** Named 40yd flies. Custom gates such as 17-33 stay unaliased. */
const YARD_FORTY_FLIES = new Set(["5-10", "5-15", "10-20", "20-30", "20-40"]);

export function aliasForWindow(window: {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
}): SpeedAlias | null {
  const { distance_unit: unit, start_distance: start, end_distance: end } = window;
  const component = windowLabel(start, end, unit);
  if (unit === "m" && start === 0 && ACCEL_ENDS_M.includes(end)) {
    return { legacy_metric_key: `${end}m_Accel`, legacy_component: component };
  }
  if (unit === "m" && start > 0) {
    const key = `${start}-${end}m_Split`;
    if (LEGACY_SPEED_KEYS.has(key)) return { legacy_metric_key: key, legacy_component: component };
  }
  if (unit === "yd" && start === 0 && end === 40) {
    return { legacy_metric_key: "40yd_Dash", legacy_component: component };
  }
  if (unit === "yd" && start === 0 && (end === 5 || end === 10 || end === 20)) {
    return { legacy_metric_key: "20yd_Dash", legacy_component: component };
  }
  if (unit === "yd" && start > 0 && YARD_FORTY_FLIES.has(`${start}-${end}`)) {
    return { legacy_metric_key: "40yd_Dash", legacy_component: component };
  }
  if (unit === "m" && start === 0 && end === 40) {
    return { legacy_metric_key: "40m_Sprint", legacy_component: component };
  }
  if (unit === "m" && start === 0 && end === 50) {
    return { legacy_metric_key: "50m_Sprint", legacy_component: component };
  }
  return null;
}

export function sameSpeedMark(
  row: {
    metric_key: string;
    component: string | null;
    legacy_metric_key?: string | null;
    legacy_component?: string | null;
  },
  metricKey: string,
  component: string | null
): boolean {
  const componentMatches = (left: string | null | undefined) =>
    component == null || component === "" || left === component;
  if (row.metric_key === metricKey && componentMatches(row.component)) return true;
  return row.legacy_metric_key === metricKey && componentMatches(row.legacy_component ?? row.component);
}
