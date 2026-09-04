import { FORTY_YD_DASH, TWENTY_YD_DASH } from "../editor-metrics";

export function isForceStandIn(entry: {
  metric_key: string;
  component: string | null;
}): boolean {
  return (
    entry.component === "0-20yd" &&
    (entry.metric_key === TWENTY_YD_DASH || entry.metric_key === FORTY_YD_DASH)
  );
}
