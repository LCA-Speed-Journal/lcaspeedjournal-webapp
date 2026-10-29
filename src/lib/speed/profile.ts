import { spanningBuildInKeys, windowIdentity } from "./adjacent";

export type DistanceUnit = "m" | "yd";

type Numeric = number | string;

export type BuildInDistanceRow = {
  start_distance: Numeric;
  end_distance: Numeric;
  distance_unit: DistanceUnit;
  display_value: Numeric;
};

export type VelocitySegment = {
  x1: number;
  x2: number;
  mph: number;
};

/** One stored fly, with the identity spanning detection needs. */
export type SpeedProfileRow = BuildInDistanceRow & {
  athlete_id: string;
  athlete_name: string;
  session_id: string;
  metric_key: string;
  component: string;
};

export type SpeedDot = {
  athlete_id: string;
  athlete_name: string;
  component: string;
  x: number;
  mph: number;
  distance_unit: DistanceUnit;
};

export type CurvePoint = {
  x: number;
  mph: number;
};

function flyLengthOf(row: BuildInDistanceRow): number {
  return Number(row.end_distance) - Number(row.start_distance);
}

export function segmentsForFlyLength(
  rows: BuildInDistanceRow[],
  unit: DistanceUnit,
  flyLength: number
): VelocitySegment[] {
  return rows
    .filter((row) => row.distance_unit === unit && flyLengthOf(row) === flyLength)
    .map((row) => ({
      x1: Number(row.start_distance),
      x2: Number(row.end_distance),
      mph: Number(row.display_value),
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.x1) &&
        Number.isFinite(segment.x2) &&
        Number.isFinite(segment.mph)
    );
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median mph at each start distance for one fly length. Other fly lengths stay out. */
export function medianSegmentsForFlyLength(
  rows: BuildInDistanceRow[],
  unit: DistanceUnit,
  flyLength: number
): VelocitySegment[] {
  const byStart = new Map<number, { x2: number; mphs: number[] }>();
  for (const segment of segmentsForFlyLength(rows, unit, flyLength)) {
    const group = byStart.get(segment.x1);
    if (group) {
      group.mphs.push(segment.mph);
    } else {
      byStart.set(segment.x1, { x2: segment.x2, mphs: [segment.mph] });
    }
  }
  return [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x1, group]) => ({
      x1,
      x2: group.x2,
      mph: median(group.mphs),
    }));
}

function finiteWindow(row: SpeedProfileRow): {
  start: number;
  end: number;
  mph: number;
} | null {
  const start = Number(row.start_distance);
  const end = Number(row.end_distance);
  const mph = Number(row.display_value);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(mph)) return null;
  if (row.distance_unit !== "m" && row.distance_unit !== "yd") return null;
  return { start, end, mph };
}

/** Best non-spanning fly per athlete, component, and unit, plotted at the window midpoint. */
export function speedDots(rows: SpeedProfileRow[]): SpeedDot[] {
  const spanning = spanningBuildInKeys(
    rows.flatMap((row) => {
      const window = finiteWindow(row);
      if (!window) return [];
      return [
        {
          session_id: row.session_id,
          metric_key: row.metric_key,
          component: row.component,
          distance_unit: row.distance_unit,
          start_distance: window.start,
          end_distance: window.end,
        },
      ];
    })
  );

  const best = new Map<string, SpeedDot>();
  for (const row of rows) {
    const window = finiteWindow(row);
    if (!window) continue;
    const identity = windowIdentity({
      session_id: row.session_id,
      metric_key: row.metric_key,
      component: row.component,
      distance_unit: row.distance_unit,
      start_distance: window.start,
      end_distance: window.end,
    });
    if (spanning.has(identity)) continue;
    const dot: SpeedDot = {
      athlete_id: row.athlete_id,
      athlete_name: row.athlete_name,
      component: row.component,
      x: (window.start + window.end) / 2,
      mph: window.mph,
      distance_unit: row.distance_unit,
    };
    const key = `${row.athlete_id}|${row.component}|${row.distance_unit}`;
    const existing = best.get(key);
    if (!existing || dot.mph > existing.mph) best.set(key, dot);
  }
  return [...best.values()];
}

/** Median mph at each midpoint for one unit, anchored at 0 mph at distance 0. */
export function medianCurve(dots: SpeedDot[]): CurvePoint[] {
  const unit = dots[0]?.distance_unit;
  const sameUnit = unit == null ? dots : dots.filter((dot) => dot.distance_unit === unit);
  const byX = new Map<number, number[]>();
  for (const dot of sameUnit) {
    const mphs = byX.get(dot.x);
    if (mphs) mphs.push(dot.mph);
    else byX.set(dot.x, [dot.mph]);
  }
  const points = [...byX.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, mphs]) => ({ x, mph: median(mphs) }));
  return [{ x: 0, mph: 0 }, ...points];
}
