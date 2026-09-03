import {
  FORTY_YD_DASH,
  FORTY_YD_PRIMARY_COMPONENT,
  TWENTY_YD_DASH,
} from "./editor-metrics";
import type { TestingDayMatrix, TestingDayMatrixColumn } from "./testing-day";

export const PLACE_POINTS = [10, 8, 7, 6, 4, 3, 2, 1] as const;

export const TOTAL_COLUMN_KEY = "total";

export type GenderPool = "M" | "F" | "U";

export function genderPool(
  gender: "M" | "F" | null | undefined
): GenderPool {
  return gender === "M" || gender === "F" ? gender : "U";
}

export function pointsForPlace(place: number): number {
  if (place < 1 || place > 8) return 0;
  return PLACE_POINTS[place - 1];
}

export type RankMarkInput = {
  athlete_id: string;
  gender: "M" | "F" | null;
  display_value: number;
};

export type RankedMark = RankMarkInput & {
  rank: number;
  tied: boolean;
  points: number;
};

export function rankMarksWithinGender(
  marks: RankMarkInput[],
  lowerIsBetter: boolean
): RankedMark[] {
  const buckets = new Map<GenderPool, RankMarkInput[]>();
  for (const mark of marks) {
    const pool = genderPool(mark.gender);
    const list = buckets.get(pool) ?? [];
    list.push(mark);
    buckets.set(pool, list);
  }

  const out: RankedMark[] = [];
  for (const poolMarks of buckets.values()) {
    const sorted = poolMarks.toSorted((a, b) => {
      if (a.display_value !== b.display_value) {
        return lowerIsBetter
          ? a.display_value - b.display_value
          : b.display_value - a.display_value;
      }
      return a.athlete_id.localeCompare(b.athlete_id);
    });
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (
        j < sorted.length &&
        sorted[j].display_value === sorted[i].display_value
      ) {
        j += 1;
      }
      const place = i + 1;
      const tied = j - i > 1;
      const points = pointsForPlace(place);
      for (let k = i; k < j; k++) {
        out.push({ ...sorted[k], rank: place, tied, points });
      }
      i = j;
    }
  }
  return out;
}

export function formatPlace(place: number, tied: boolean): string {
  const j = place % 10;
  const k = place % 100;
  let suffix = "th";
  if (j === 1 && k !== 11) suffix = "st";
  else if (j === 2 && k !== 12) suffix = "nd";
  else if (j === 3 && k !== 13) suffix = "rd";
  return `${tied ? "T-" : ""}${place}${suffix}`;
}

export const SPRINT_FAMILY_METRIC_KEYS = [
  "40yd_Dash",
  "20yd_Dash",
  "MaxVelocity",
] as const;

export function isSprintFamilyMetric(metricKey: string): boolean {
  return (SPRINT_FAMILY_METRIC_KEYS as readonly string[]).includes(metricKey);
}

export function scoreAthleteTotals(
  pointsByMetric: Record<string, number>
): { sprint_points: number; total_points: number } {
  const sprint: number[] = [];
  let other = 0;
  for (const [key, points] of Object.entries(pointsByMetric)) {
    if (isSprintFamilyMetric(key)) sprint.push(points);
    else other += points;
  }
  const sprint_points =
    sprint.length === 0
      ? 0
      : sprint.reduce((sum, n) => sum + n, 0) / sprint.length;
  return { sprint_points, total_points: sprint_points + other };
}

export type ScoredSortRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  total_points: number;
  rank_40: number | null;
  rank_20: number | null;
};

export function compareScoredAthletes(
  a: ScoredSortRow,
  b: ScoredSortRow,
  has40: boolean,
  has20: boolean
): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  if (has40) {
    const ar = a.rank_40 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_40 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
  }
  if (has20) {
    const ar = a.rank_20 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_20 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
  }
  return (
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name) ||
    a.athlete_id.localeCompare(b.athlete_id)
  );
}

export function scoreTestingDayMatrix(matrix: TestingDayMatrix): TestingDayMatrix {
  const scoringColumns = matrix.columns
    .filter((c) => (c.kind ?? "test") !== "total")
    .map((c) => ({ ...c, kind: c.kind ?? "test" }));
  const athletes = matrix.athletes.map((athlete) => ({
    ...athlete,
    cells: { ...athlete.cells },
  }));

  for (const column of scoringColumns) {
    const marks = athletes
      .filter((athlete) => athlete.cells[column.key])
      .map((athlete) => ({
        athlete_id: athlete.athlete_id,
        gender: athlete.gender,
        display_value: athlete.cells[column.key]!.display_value,
      }));
    const lowerIsBetter = (column.units ?? "").toLowerCase() === "s";
    const ranked = rankMarksWithinGender(marks, lowerIsBetter);
    const byId = new Map(ranked.map((row) => [row.athlete_id, row]));
    for (const athlete of athletes) {
      const cell = athlete.cells[column.key];
      const row = byId.get(athlete.athlete_id);
      if (!cell || !row) continue;
      athlete.cells[column.key] = {
        ...cell,
        rank: row.rank,
        tied: row.tied,
        points: row.points,
      };
    }
  }

  const fortyKey = scoringColumns.find(
    (c) =>
      c.metric_key === FORTY_YD_DASH && c.component === FORTY_YD_PRIMARY_COMPONENT
  )?.key;
  const twentyKey = scoringColumns.find((c) => c.metric_key === TWENTY_YD_DASH)
    ?.key;

  for (const athlete of athletes) {
    const pointsByMetric: Record<string, number> = {};
    for (const column of scoringColumns) {
      const points = athlete.cells[column.key]?.points;
      if (points == null) continue;
      pointsByMetric[column.metric_key] = points;
    }
    const totals = scoreAthleteTotals(pointsByMetric);
    athlete.sprint_points = totals.sprint_points;
    athlete.total_points = totals.total_points;
    athlete.cells[TOTAL_COLUMN_KEY] = { display_value: totals.total_points };
  }

  athletes.sort((a, b) =>
    compareScoredAthletes(
      {
        athlete_id: a.athlete_id,
        first_name: a.first_name,
        last_name: a.last_name,
        total_points: a.total_points ?? 0,
        rank_40: fortyKey ? (a.cells[fortyKey]?.rank ?? null) : null,
        rank_20: twentyKey ? (a.cells[twentyKey]?.rank ?? null) : null,
      },
      {
        athlete_id: b.athlete_id,
        first_name: b.first_name,
        last_name: b.last_name,
        total_points: b.total_points ?? 0,
        rank_40: fortyKey ? (b.cells[fortyKey]?.rank ?? null) : null,
        rank_20: twentyKey ? (b.cells[twentyKey]?.rank ?? null) : null,
      },
      Boolean(fortyKey),
      Boolean(twentyKey)
    )
  );

  const totalColumn: TestingDayMatrixColumn = {
    key: TOTAL_COLUMN_KEY,
    metric_key: TOTAL_COLUMN_KEY,
    display_name: "Total",
    component: null,
    units: "pts",
    kind: "total",
  };

  return { columns: [...scoringColumns, totalColumn], athletes };
}
