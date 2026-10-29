import { BUILD_IN_KEY } from "./windows";

export type BuildInMark = {
  metric_key: string;
  component: string | null;
  display_value: number;
};

export function bestBuildIn(rows: BuildInMark[]): { display_value: number; component: string } | null {
  let best: { display_value: number; component: string } | null = null;
  for (const row of rows) {
    if (row.metric_key !== BUILD_IN_KEY) continue;
    if (!Number.isFinite(row.display_value)) continue;
    if (best == null || row.display_value > best.display_value) {
      best = { display_value: row.display_value, component: row.component ?? "" };
    }
  }
  return best;
}
