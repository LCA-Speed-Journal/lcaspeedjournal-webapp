import { FORTY_YD_DASH } from "@/lib/norms/editor-metrics";
import { sameSpeedMark } from "@/lib/speed/windows";

export const TEN_YD_KEY = "10yd_Split";

type TenYardRow = {
  athlete_id: string;
  metric_key: string;
  component: string | null;
  legacy_metric_key?: string | null;
  legacy_component?: string | null;
  display_value: number;
};

export function bestTenYardMarks(
  rows: TenYardRow[]
): { athlete_id: string; key: typeof TEN_YD_KEY; value: number }[] {
  const best = new Map<string, number>();
  for (const row of rows) {
    if (!sameSpeedMark(row, FORTY_YD_DASH, "0-10yd")) continue;
    const current = best.get(row.athlete_id);
    if (current == null || row.display_value < current) best.set(row.athlete_id, row.display_value);
  }
  return [...best].map(([athlete_id, value]) => ({
    athlete_id,
    key: TEN_YD_KEY,
    value,
  }));
}
