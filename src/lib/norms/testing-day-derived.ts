import { FORTY_YD_DASH, TWENTY_YD_DASH } from "./editor-metrics";
import { mphFromYardSplit, yardsInFortyComponent } from "./forty-yd";
import { pickBestTestingDayHits, type TestingDayHit } from "./testing-day";

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
