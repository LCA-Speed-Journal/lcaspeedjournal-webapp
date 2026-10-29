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
