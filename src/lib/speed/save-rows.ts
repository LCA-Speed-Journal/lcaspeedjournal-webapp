import {
  aliasForWindow,
  expandSpeedRun,
  type SpeedRunInput,
  type SpeedRunRow,
} from "./windows";

export type SpeedRunSaveRow = SpeedRunRow & {
  legacy_metric_key: string | null;
  legacy_component: string | null;
};

export function rowsForSpeedRun(input: SpeedRunInput): SpeedRunSaveRow[] {
  return expandSpeedRun(input).map((row) => {
    const alias = aliasForWindow(row);
    return {
      ...row,
      legacy_metric_key: alias?.legacy_metric_key ?? null,
      legacy_component: alias?.legacy_component ?? null,
    };
  });
}
