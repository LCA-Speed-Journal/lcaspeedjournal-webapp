import { isPrimaryResultComponent } from "@/lib/metric-utils";
import {
  isFortyYardMphPrimary,
  mphFromYardSplit,
  yardsInFortyComponent,
} from "@/lib/norms/forty-yd";
import { getMetricsRegistry } from "@/lib/parser";
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
};

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

function toCell(athlete: LeaderAthlete, best_value: number): LeaderCell {
  return {
    athlete_id: athlete.id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    best_value,
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
    men: v.men ? toCell(athletesById.get(v.men.athlete_id)!, v.men.value) : null,
    women: v.women
      ? toCell(athletesById.get(v.women.athlete_id)!, v.women.value)
      : null,
  };
}

function flyMph(
  metricKey: string,
  component: string,
  minVal: number,
  maxVal: number,
  units: string
): number | null {
  if ((units ?? "").toLowerCase() === "mph") return maxVal;
  if (!isFortyYardMphPrimary(metricKey, component)) return null;
  const yards = yardsInFortyComponent(component);
  if (yards == null) return null;
  return mphFromYardSplit(minVal, yards);
}

function rootSortKey(row: LeaderMetricRow): [number, string] {
  if (row.metric_key === "40yd_Dash") return [0, row.display_name];
  if (row.metric_key === "20yd_Dash") return [1, row.display_name];
  if (row.metric_key === getMaxVelocityKey()) return [2, row.display_name];
  return [10, row.display_name];
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
    const isVelocity = velocityKeys.has(metric_key);

    if (isVelocity) {
      const v = agg.max_val;
      if (slot === "men") {
        maxVelMen = considerBest(maxVelMen, { athlete_id, value: v }, false);
      } else {
        maxVelWomen = considerBest(maxVelWomen, { athlete_id, value: v }, false);
      }
    }

    const mph = flyMph(
      metric_key,
      component,
      agg.min_val,
      agg.max_val,
      agg.units
    );
    if (mph != null) {
      if (slot === "men") {
        maxVelMen = considerBest(maxVelMen, { athlete_id, value: mph }, false);
      } else {
        maxVelWomen = considerBest(maxVelWomen, { athlete_id, value: mph }, false);
      }
    }

    if (isVelocity) continue;

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
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
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
