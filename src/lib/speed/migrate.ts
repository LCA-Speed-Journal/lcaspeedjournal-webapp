import {
  aliasForWindow,
  BUILD_IN_KEY,
  classifyLegacySpeedRow,
  flyDistance,
  mphForWindow,
  timeFromMph,
  type DistanceUnit,
  type SpeedRunRow,
  type SpeedWindow,
} from "./windows";

export type LegacyEntry = {
  id: string;
  session_id: string;
  athlete_id: string;
  metric_key: string;
  component: string | null;
  value: number;
  display_value: number;
  units: string;
};

export type SpeedUpdate = SpeedRunRow & {
  id: string;
  legacy_metric_key: string;
  legacy_component: string | null;
};

export type SpeedMigrationPlan = {
  updates: SpeedUpdate[];
  deleteIds: string[];
  skipped: LegacyEntry[];
  unparsed: LegacyEntry[];
  conflicts: { key: string; ids: string[] }[];
};

/** Recovered times within this many seconds are the same rep. */
const TIME_EPSILON = 0.001;

type PreparedRow = {
  source: LegacyEntry;
  timeS: number;
  update: SpeedUpdate;
};

function isMph(units: string): boolean {
  return units.trim().toLowerCase() === "mph";
}

function cohortKey(
  row: Pick<LegacyEntry, "session_id" | "athlete_id">,
  unit: DistanceUnit,
  start: number,
  end: number
): string {
  return `${row.session_id}|${row.athlete_id}|${unit}|${start}|${end}`;
}

function legacyComponent(row: LegacyEntry, window: SpeedWindow): string | null {
  if (row.component != null) return row.component;
  return aliasForWindow(window)?.legacy_component ?? null;
}

function prepareRow(row: LegacyEntry, window: SpeedWindow): PreparedRow {
  const fly = flyDistance(window.start_distance, window.end_distance);
  const storedMph = isMph(row.units);
  const timeS = storedMph
    ? timeFromMph(fly, window.distance_unit, Number(row.display_value))
    : Number(row.value);
  const buildIn = window.metric_key === BUILD_IN_KEY;
  const displayValue = buildIn
    ? storedMph
      ? Number(row.display_value)
      : mphForWindow(fly, window.distance_unit, timeS)
    : timeS;

  return {
    source: row,
    timeS,
    update: {
      ...window,
      id: row.id,
      value: timeS,
      display_value: displayValue,
      units: buildIn ? "mph" : "s",
      interval_index: null,
      legacy_metric_key: row.metric_key,
      legacy_component: legacyComponent(row, window),
    },
  };
}

function preferMphSource(list: PreparedRow[]): PreparedRow {
  let keeper = list[0];
  for (const item of list) {
    if (isMph(item.source.units) && !isMph(keeper.source.units)) keeper = item;
  }
  return keeper;
}

export function planSpeedMigration(rows: LegacyEntry[]): SpeedMigrationPlan {
  const skipped: LegacyEntry[] = [];
  const unparsed: LegacyEntry[] = [];
  const groups = new Map<string, PreparedRow[]>();

  for (const row of rows) {
    if (row.metric_key === "MaxVelocity") {
      unparsed.push(row);
      continue;
    }

    let window: SpeedWindow | null;
    try {
      window = classifyLegacySpeedRow(row);
    } catch {
      unparsed.push(row);
      continue;
    }
    if (!window) {
      skipped.push(row);
      continue;
    }

    const prepared = prepareRow(row, window);
    const key = cohortKey(row, window.distance_unit, window.start_distance, window.end_distance);
    const list = groups.get(key);
    if (list) list.push(prepared);
    else groups.set(key, [prepared]);
  }

  const updates: SpeedUpdate[] = [];
  const deleteIds: string[] = [];
  const conflicts: SpeedMigrationPlan["conflicts"] = [];

  for (const [key, list] of groups) {
    let low = list[0].timeS;
    let high = list[0].timeS;
    for (const item of list) {
      if (item.timeS < low) low = item.timeS;
      if (item.timeS > high) high = item.timeS;
    }

    if (high - low > TIME_EPSILON) {
      conflicts.push({ key, ids: list.map((item) => item.source.id) });
      for (const item of list) updates.push(item.update);
      continue;
    }

    const keeper = preferMphSource(list);
    updates.push(keeper.update);
    for (const item of list) {
      if (item !== keeper) deleteIds.push(item.source.id);
    }
  }

  return { updates, deleteIds, skipped, unparsed, conflicts };
}
