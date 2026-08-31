import {
  attachZones,
  type AttachZonesDefault,
  type AttachZonesMembership,
  type AttachZonesPopulation,
  type AttachZonesThreshold,
} from "./attach-zones";
import { mapThresholdRows, type RawThresholdRow } from "./leaderboard-zones";

export type ExportThreshold = AttachZonesThreshold & { metric_key: string };

export type ExportZoneRow = {
  athlete_id: string;
  gender: string | null;
  metric_key: string;
  component: string | null;
  display_value: string | number;
};

export type ExportZoneCells = {
  zone_label: string;
  population_name: string;
};

export type RawExportThresholdRow = RawThresholdRow & { metric_key: string };

export function mapExportThresholdRows(
  rows: RawExportThresholdRow[]
): ExportThreshold[] {
  return mapThresholdRows(rows).map((row, i) => ({
    ...row,
    metric_key: rows[i].metric_key,
  }));
}

function normalizeComponent(component: string | null | undefined): string | null {
  return component == null || component === "" ? null : component;
}

function groupKey(metricKey: string, component: string | null): string {
  return `${metricKey}\0${component ?? ""}`;
}

/**
 * Attach current-stick zones to mixed-metric export rows.
 * Unbadged marks get empty strings so CSV cells stay blank.
 */
export function attachExportZones<T extends ExportZoneRow>(input: {
  rows: T[];
  memberships: AttachZonesMembership[];
  defaults: AttachZonesDefault[];
  thresholds: ExportThreshold[];
  populations: AttachZonesPopulation[];
  lowerIsBetterFor: (metricKey: string) => boolean;
}): Array<T & ExportZoneCells> {
  const groups = new Map<string, number[]>();
  input.rows.forEach((row, index) => {
    const key = groupKey(row.metric_key, normalizeComponent(row.component));
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  });

  const out: Array<T & ExportZoneCells> = input.rows.map((row) => ({
    ...row,
    zone_label: "",
    population_name: "",
  }));

  for (const indices of groups.values()) {
    const first = input.rows[indices[0]];
    const metricKey = first.metric_key;
    const component = normalizeComponent(first.component);
    const groupRows = indices.map((i) => ({
      athlete_id: input.rows[i].athlete_id,
      gender: input.rows[i].gender,
      display_value: Number(input.rows[i].display_value),
      _i: i,
    }));

    const zoned = attachZones({
      rows: groupRows,
      memberships: input.memberships,
      defaults: input.defaults,
      thresholds: input.thresholds.filter((t) => t.metric_key === metricKey),
      populations: input.populations,
      metricKey,
      component,
      lowerIsBetter: input.lowerIsBetterFor(metricKey),
    });

    for (const zonedRow of zoned) {
      out[zonedRow._i] = {
        ...input.rows[zonedRow._i],
        zone_label: zonedRow.zone_label ?? "",
        population_name: zonedRow.population_name ?? "",
      };
    }
  }

  return out;
}
