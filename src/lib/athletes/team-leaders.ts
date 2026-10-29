import { isPrimaryResultComponent } from "@/lib/metric-utils";
import { getMetricsRegistry } from "@/lib/parser";
import { spanningBuildInKeys, windowIdentity, type SpeedWindowRow } from "@/lib/speed/adjacent";
import { ACCELERATION_KEY, BUILD_IN_KEY } from "@/lib/speed/windows";
import {
  getMaxVelocityKey,
  getVelocityMetricKeys,
  hasVelocityMetrics,
} from "@/lib/velocity-metrics";
import { HUGO_GROUPS } from "@/lib/weight-room/constants";

export type LeaderEntryRow = {
  athlete_id: string;
  metric_key: string;
  component: string | null;
  display_value: number;
  units: string;
  session_id?: string;
  start_distance?: number | null;
  end_distance?: number | null;
  distance_unit?: string | null;
};

export type LeaderAthlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  hugo_groups: string[];
};

export type LeaderCell = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  best_value: number;
  window_label?: string | null;
};

export type LeaderMetricRow = {
  metric_key: string;
  component?: string | null;
  display_name: string;
  units: string;
  lower_is_better: boolean;
  men: LeaderCell | null;
  women: LeaderCell | null;
  splits?: LeaderMetricRow[];
};

export type HugoLeaderBlock = {
  hugo_group: string;
  leaders: LeaderMetricRow[];
};

type GenderSlot = "men" | "women";

type BestMark = {
  athlete_id: string;
  value: number;
  window_label?: string | null;
};

const WINDOW_COMPONENT = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(m|yd)$/;

type MetricAgg = {
  display_name: string;
  units: string;
  lower_is_better: boolean;
  men: BestMark | null;
  women: BestMark | null;
};

const DASH_METRICS = new Set(["40yd_Dash", "20yd_Dash"]);

function isMale(g: string | null): boolean {
  const lower = (g ?? "").toLowerCase();
  return lower === "m" || lower === "male";
}

function isFemale(g: string | null): boolean {
  const lower = (g ?? "").toLowerCase();
  return lower === "f" || lower === "female";
}

function genderSlot(g: string | null): GenderSlot | null {
  if (isMale(g)) return "men";
  if (isFemale(g)) return "women";
  return null;
}

function toCell(athlete: LeaderAthlete, mark: BestMark): LeaderCell {
  return {
    athlete_id: athlete.id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    best_value: mark.value,
    window_label: mark.window_label ?? null,
  };
}

function toSpeedWindow(row: LeaderEntryRow): SpeedWindowRow | null {
  if (row.metric_key !== ACCELERATION_KEY && row.metric_key !== BUILD_IN_KEY) return null;
  if (!row.session_id || !row.component) return null;
  if (row.distance_unit !== "m" && row.distance_unit !== "yd") return null;
  if (row.start_distance == null || row.end_distance == null) return null;
  const start_distance = Number(row.start_distance);
  const end_distance = Number(row.end_distance);
  if (!Number.isFinite(start_distance) || !Number.isFinite(end_distance)) return null;
  return {
    session_id: row.session_id,
    metric_key: row.metric_key,
    component: row.component,
    distance_unit: row.distance_unit,
    start_distance,
    end_distance,
  };
}

function considerBest(
  existing: BestMark | null,
  candidate: BestMark,
  lowerIsBetter: boolean
): BestMark {
  if (!existing) return candidate;
  const better = lowerIsBetter
    ? candidate.value < existing.value
    : candidate.value > existing.value;
  return better ? candidate : existing;
}

function hasAnyCell(rows: LeaderMetricRow[]): boolean {
  return rows.some(
    (r) =>
      r.men != null ||
      r.women != null ||
      (r.splits ?? []).some((s) => s.men != null || s.women != null)
  );
}

function splitSortKey(component: string): [number, number, string] {
  const m = component.match(/^(\d+)-(\d+)/);
  if (!m) return [999, 999, component];
  return [Number(m[1]), Number(m[2]), component];
}

function applyMark(
  byMetric: Map<string, MetricAgg>,
  metricKey: string,
  displayName: string,
  units: string,
  lowerIsBetter: boolean,
  slot: GenderSlot,
  candidate: BestMark
) {
  const existing = byMetric.get(metricKey);
  if (!existing) {
    byMetric.set(metricKey, {
      display_name: displayName,
      units,
      lower_is_better: lowerIsBetter,
      men: slot === "men" ? candidate : null,
      women: slot === "women" ? candidate : null,
    });
    return;
  }
  existing[slot] = considerBest(existing[slot], candidate, lowerIsBetter);
}

function rowFromAgg(
  metricKey: string,
  v: MetricAgg,
  athletesById: Map<string, LeaderAthlete>,
  component?: string | null
): LeaderMetricRow {
  return {
    metric_key: metricKey,
    component: component ?? null,
    display_name: v.display_name,
    units: v.units,
    lower_is_better: v.lower_is_better,
    men: v.men ? toCell(athletesById.get(v.men.athlete_id)!, v.men) : null,
    women: v.women ? toCell(athletesById.get(v.women.athlete_id)!, v.women) : null,
  };
}

function rootSortKey(row: LeaderMetricRow): [number, number, number, string] {
  if (row.metric_key === "40yd_Dash") return [0, 0, 0, row.display_name];
  if (row.metric_key === "20yd_Dash") return [1, 0, 0, row.display_name];
  if (row.metric_key === getMaxVelocityKey()) return [2, 0, 0, row.display_name];
  const tab = row.metric_key.indexOf("\t");
  const kind =
    row.metric_key.startsWith(`${ACCELERATION_KEY}\t`)
      ? 3
      : row.metric_key.startsWith(`${BUILD_IN_KEY}\t`)
        ? 4
        : null;
  if (kind != null && tab >= 0) {
    const component = row.metric_key.slice(tab + 1);
    const match = component.match(WINDOW_COMPONENT);
    if (match) return [kind, Number(match[1]), Number(match[2]), component];
    return [kind, 999, 999, component];
  }
  return [10, 0, 0, row.display_name];
}

function buildMetricRows(
  athletes: LeaderAthlete[],
  entries: LeaderEntryRow[]
): LeaderMetricRow[] {
  const athletesById = new Map(athletes.map((a) => [a.id, a]));
  const registry = getMetricsRegistry();
  const velocityKeys = new Set(
    hasVelocityMetrics() ? getVelocityMetricKeys() : []
  );
  const maxVelKey = getMaxVelocityKey();

  const byAthleteComp = new Map<
    string,
    { min_val: number; max_val: number; units: string }
  >();

  for (const r of entries) {
    if (!athletesById.has(r.athlete_id)) continue;
    const val = Number(r.display_value);
    if (!Number.isFinite(val)) continue;
    const component = r.component ?? "";
    const k = `${r.athlete_id}\t${r.metric_key}\t${component}`;
    const existing = byAthleteComp.get(k);
    const units = r.units ?? "";
    if (!existing) {
      byAthleteComp.set(k, { min_val: val, max_val: val, units });
    } else {
      byAthleteComp.set(k, {
        min_val: Math.min(existing.min_val, val),
        max_val: Math.max(existing.max_val, val),
        units: units || existing.units,
      });
    }
  }

  const byMetric = new Map<string, MetricAgg>();
  const splitsByMetric = new Map<string, Map<string, MetricAgg>>();
  let maxVelMen: BestMark | null = null;
  let maxVelWomen: BestMark | null = null;

  for (const [key, agg] of byAthleteComp) {
    const [athlete_id, metric_key, component] = key.split("\t");
    if (!athlete_id || !metric_key) continue;
    const athlete = athletesById.get(athlete_id);
    if (!athlete) continue;
    const slot = genderSlot(athlete.gender);
    if (!slot) continue;

    const def = registry[metric_key];
    const units = def?.display_units ?? agg.units ?? "";
    const unitsLower = units.toLowerCase();
    const lowerIsBetter = unitsLower === "s";
    const value = lowerIsBetter ? agg.min_val : agg.max_val;
    const candidate: BestMark = { athlete_id, value };
    const isPrimary = isPrimaryResultComponent(
      metric_key,
      component || null,
      registry
    );

    if (velocityKeys.has(metric_key)) continue;

    if (DASH_METRICS.has(metric_key) && !isPrimary && component) {
      const splitName = component;
      let splitMap = splitsByMetric.get(metric_key);
      if (!splitMap) {
        splitMap = new Map();
        splitsByMetric.set(metric_key, splitMap);
      }
      applyMark(
        splitMap,
        component,
        splitName,
        unitsLower === "mph" ? "mph" : "s",
        unitsLower !== "mph",
        slot,
        candidate
      );
      continue;
    }

    if (!isPrimary) continue;
    if (metric_key === ACCELERATION_KEY || metric_key === BUILD_IN_KEY) continue;

    applyMark(
      byMetric,
      metric_key,
      def?.display_name ?? metric_key,
      units,
      lowerIsBetter,
      slot,
      candidate
    );
  }

  const speedWindows: SpeedWindowRow[] = [];
  for (const entry of entries) {
    const window = toSpeedWindow(entry);
    if (window) speedWindows.push(window);
  }
  const spanning = spanningBuildInKeys(speedWindows);

  for (const entry of entries) {
    if (!athletesById.has(entry.athlete_id)) continue;
    const value = Number(entry.display_value);
    if (!Number.isFinite(value)) continue;
    const athlete = athletesById.get(entry.athlete_id);
    if (!athlete) continue;
    const slot = genderSlot(athlete.gender);
    if (!slot) continue;

    if (entry.metric_key === BUILD_IN_KEY) {
      const candidate: BestMark = {
        athlete_id: entry.athlete_id,
        value,
        window_label: entry.component,
      };
      if (slot === "men") {
        maxVelMen = considerBest(maxVelMen, candidate, false);
      } else {
        maxVelWomen = considerBest(maxVelWomen, candidate, false);
      }
    }

    const window = toSpeedWindow(entry);
    if (!window) continue;
    const mark: BestMark = { athlete_id: entry.athlete_id, value };
    if (entry.metric_key === ACCELERATION_KEY) {
      applyMark(
        byMetric,
        `${entry.metric_key}\t${window.component}`,
        window.component,
        "s",
        true,
        slot,
        mark
      );
      continue;
    }
    if (entry.metric_key === BUILD_IN_KEY && !spanning.has(windowIdentity(window))) {
      applyMark(
        byMetric,
        `${entry.metric_key}\t${window.component}`,
        window.component,
        "mph",
        false,
        slot,
        mark
      );
    }
  }

  if (maxVelMen != null || maxVelWomen != null) {
    byMetric.set(maxVelKey, {
      display_name: "Max Velocity",
      units: "mph",
      lower_is_better: false,
      men: maxVelMen,
      women: maxVelWomen,
    });
  }

  for (const metric_key of DASH_METRICS) {
    const splitMap = splitsByMetric.get(metric_key);
    if (!splitMap || splitMap.size === 0) continue;
    if (byMetric.has(metric_key)) continue;
    const def = registry[metric_key];
    byMetric.set(metric_key, {
      display_name: def?.display_name ?? metric_key,
      units: def?.display_units ?? "s",
      lower_is_better: true,
      men: null,
      women: null,
    });
  }

  const rows: LeaderMetricRow[] = [];
  for (const [metric_key, v] of byMetric) {
    const row = rowFromAgg(metric_key, v, athletesById);
    const splitMap = splitsByMetric.get(metric_key);
    if (splitMap && splitMap.size > 0) {
      row.splits = [...splitMap.entries()]
        .sort((a, b) => {
          const ka = splitSortKey(a[0]);
          const kb = splitSortKey(b[0]);
          return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
        })
        .map(([component, agg]) =>
          rowFromAgg(metric_key, agg, athletesById, component)
        );
    }
    rows.push(row);
  }

  rows.sort((a, b) => {
    const ka = rootSortKey(a);
    const kb = rootSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || ka[3].localeCompare(kb[3]);
  });
  return rows;
}

export function buildTeamLeaders({
  athletes,
  entries,
}: {
  athletes: LeaderAthlete[];
  entries: LeaderEntryRow[];
}): { overall: LeaderMetricRow[]; hugo: HugoLeaderBlock[] } {
  const overall = buildMetricRows(athletes, entries);
  const hugo: HugoLeaderBlock[] = [];
  for (const group of HUGO_GROUPS) {
    const members = athletes.filter((a) => a.hugo_groups.includes(group));
    if (members.length === 0) continue;
    const leaders = buildMetricRows(members, entries);
    if (!hasAnyCell(leaders)) continue;
    hugo.push({ hugo_group: group, leaders });
  }
  return { overall, hugo };
}
