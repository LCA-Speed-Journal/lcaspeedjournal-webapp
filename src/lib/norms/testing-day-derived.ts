import {
  FORTY_YD_DASH,
  NORMS_DEFAULTS_METRIC_KEYS,
  TWENTY_YD_DASH,
  TWENTY_YD_PRIMARY_COMPONENT,
} from "./editor-metrics";
import { mphFromYardSplit, yardsInFortyComponent } from "./forty-yd";
import {
  pickBestTestingDayHits,
  testingDayColumnKey,
  type TestingDayHit,
  type TestingDayMatrixColumn,
} from "./testing-day";
import { getMaxVelocityKey } from "@/lib/velocity-metrics";

export type DerivedSplitRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  metric_key: string;
  component: string | null;
  display_value: number;
};

function asHit(row: DerivedSplitRow, display_value: number): TestingDayHit {
  return {
    athlete_id: row.athlete_id,
    first_name: row.first_name,
    last_name: row.last_name,
    gender: row.gender,
    display_value,
  };
}

export function pickBestTwentyYdHits(rows: DerivedSplitRow[]): TestingDayHit[] {
  const candidates = rows
    .filter(
      (row) =>
        row.component === "0-20yd" &&
        (row.metric_key === TWENTY_YD_DASH || row.metric_key === FORTY_YD_DASH)
    )
    .map((row) => asHit(row, row.display_value));
  return pickBestTestingDayHits(candidates, true);
}

export function pickBestMaxVelocityHits(
  rows: DerivedSplitRow[]
): TestingDayHit[] {
  const candidates: TestingDayHit[] = [];
  for (const row of rows) {
    const from40 =
      row.metric_key === FORTY_YD_DASH && row.component === "20-40yd";
    const from20 =
      row.metric_key === TWENTY_YD_DASH && row.component === "10-20yd";
    if (!from40 && !from20) continue;
    const yards = yardsInFortyComponent(row.component);
    const mph = yards != null ? mphFromYardSplit(row.display_value, yards) : null;
    if (mph == null) continue;
    candidates.push(asHit(row, mph));
  }
  return pickBestTestingDayHits(candidates, false);
}

export type MergeDerivedSprintColumnsInput = {
  columns: TestingDayMatrixColumn[];
  hitsByColumn: Record<string, TestingDayHit[]>;
  rawEntries: DerivedSplitRow[];
};

function copyHitsByColumn(
  hitsByColumn: Record<string, TestingDayHit[]>
): Record<string, TestingDayHit[]> {
  return Object.fromEntries(
    Object.entries(hitsByColumn).map(([key, hits]) => [key, [...hits]])
  );
}

function removeMetricColumns(
  columns: TestingDayMatrixColumn[],
  hitsByColumn: Record<string, TestingDayHit[]>,
  metricKey: string
): void {
  for (let i = columns.length - 1; i >= 0; i--) {
    if (columns[i].metric_key !== metricKey) continue;
    delete hitsByColumn[columns[i].key];
    columns.splice(i, 1);
  }
}

function insertIndexAfter(
  columns: TestingDayMatrixColumn[],
  metricKeys: string[]
): number {
  for (const metricKey of metricKeys) {
    const idx = columns.findIndex((column) => column.metric_key === metricKey);
    if (idx >= 0) return idx + 1;
  }
  return columns.length;
}

function preferredInsertIndex(
  columns: TestingDayMatrixColumn[],
  metricKey: string
): number {
  const preferred = NORMS_DEFAULTS_METRIC_KEYS as readonly string[];
  const want = preferred.indexOf(metricKey);
  if (want < 0) return columns.length;
  for (let i = 0; i < columns.length; i++) {
    const colPref = preferred.indexOf(columns[i].metric_key);
    if (colPref === -1 || colPref > want) return i;
  }
  return columns.length;
}

export function mergeDerivedSprintColumns(
  input: MergeDerivedSprintColumnsInput
): {
  columns: TestingDayMatrixColumn[];
  hitsByColumn: Record<string, TestingDayHit[]>;
} {
  const columns = input.columns.map((column) => ({ ...column }));
  const hitsByColumn = copyHitsByColumn(input.hitsByColumn);

  const twentyHits = pickBestTwentyYdHits(input.rawEntries);
  if (twentyHits.length > 0) {
    const hasStandalone20 = input.rawEntries.some(
      (row) =>
        row.metric_key === TWENTY_YD_DASH &&
        row.component === TWENTY_YD_PRIMARY_COMPONENT
    );
    removeMetricColumns(columns, hitsByColumn, TWENTY_YD_DASH);
    const twentyKey = testingDayColumnKey(
      TWENTY_YD_DASH,
      TWENTY_YD_PRIMARY_COMPONENT
    );
    const twentyColumn: TestingDayMatrixColumn = {
      key: twentyKey,
      metric_key: TWENTY_YD_DASH,
      display_name: "20yd Dash",
      component: TWENTY_YD_PRIMARY_COMPONENT,
      units: "s",
      kind: hasStandalone20 ? "test" : "derived_20yd",
    };
    const twentyAt = columns.some((column) => column.metric_key === FORTY_YD_DASH)
      ? insertIndexAfter(columns, [FORTY_YD_DASH])
      : preferredInsertIndex(columns, TWENTY_YD_DASH);
    columns.splice(twentyAt, 0, twentyColumn);
    hitsByColumn[twentyKey] = twentyHits;
  }

  const maxVHits = pickBestMaxVelocityHits(input.rawEntries);
  if (maxVHits.length > 0) {
    const maxVMetric = getMaxVelocityKey();
    removeMetricColumns(columns, hitsByColumn, maxVMetric);
    const maxVKey = testingDayColumnKey(maxVMetric, null);
    const maxVColumn: TestingDayMatrixColumn = {
      key: maxVKey,
      metric_key: maxVMetric,
      display_name: "Max Velocity",
      component: null,
      units: "mph",
      kind: "derived_max_v",
    };
    columns.splice(
      insertIndexAfter(columns, [TWENTY_YD_DASH, FORTY_YD_DASH]),
      0,
      maxVColumn
    );
    hitsByColumn[maxVKey] = maxVHits;
  }

  return { columns, hitsByColumn };
}
