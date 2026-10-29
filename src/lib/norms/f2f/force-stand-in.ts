import { sameSpeedMark } from "@/lib/speed/windows";
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "../editor-metrics";
import { canonicalSprintComponent } from "./sprint-component";

export type SpeedMarkRow = {
  metric_key: string;
  component: string | null;
  legacy_metric_key?: string | null;
  legacy_component?: string | null;
  units?: string | null;
};

/** `sameSpeedMark` compares components exactly, so canonicalize labels like "0-20" first. */
function canonicalSpeedRow(entry: SpeedMarkRow): SpeedMarkRow {
  return {
    metric_key: entry.metric_key,
    component: canonicalSprintComponent(entry.component),
    legacy_metric_key: entry.legacy_metric_key,
    legacy_component:
      entry.legacy_component == null
        ? entry.legacy_component
        : canonicalSprintComponent(entry.legacy_component),
    units: entry.units,
  };
}

export function matchesSpeedMark(
  entry: SpeedMarkRow,
  metricKey: string,
  component: string | null
): boolean {
  return sameSpeedMark(canonicalSpeedRow(entry), metricKey, component);
}

export function matchesEitherDash(
  entry: SpeedMarkRow,
  component: string | null
): boolean {
  return (
    matchesSpeedMark(entry, FORTY_YD_DASH, component) ||
    matchesSpeedMark(entry, TWENTY_YD_DASH, component)
  );
}

export function isForceStandIn(entry: SpeedMarkRow): boolean {
  return (
    matchesSpeedMark(entry, TWENTY_YD_DASH, "0-20yd") ||
    matchesSpeedMark(entry, FORTY_YD_DASH, "0-20yd")
  );
}
