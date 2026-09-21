import { isPrimaryResultComponent } from "@/lib/metric-utils";
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
  display_name: string;
  units: string;
  lower_is_better: boolean;
  men: LeaderCell | null;
  women: LeaderCell | null;
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

function athleteMetricKey(athleteId: string, metricKey: string): string {
  return `${athleteId}\t${metricKey}`;
}

function toCell(
  athlete: LeaderAthlete,
  best_value: number
): LeaderCell {
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
  return rows.some((r) => r.men != null || r.women != null);
}

function buildMetricRows(
  athletes: LeaderAthlete[],
  entries: LeaderEntryRow[]
): LeaderMetricRow[] {
  const athletesById = new Map(athletes.map((a) => [a.id, a]));
  const registry = getMetricsRegistry();
  const velocityKeys = hasVelocityMetrics() ? getVelocityMetricKeys() : [];
  const maxVelKey = getMaxVelocityKey();

  const byAthleteMetric = new Map<
    string,
    { min_val: number; max_val: number; units: string }
  >();

  for (const r of entries) {
    if (!athletesById.has(r.athlete_id)) continue;
    if (!isPrimaryResultComponent(r.metric_key, r.component, registry)) {
      continue;
    }
    const k = athleteMetricKey(r.athlete_id, r.metric_key);
    const existing = byAthleteMetric.get(k);
    const val = Number(r.display_value);
    const units = r.units ?? "";
    if (!existing) {
      byAthleteMetric.set(k, { min_val: val, max_val: val, units });
    } else {
      byAthleteMetric.set(k, {
        min_val: Math.min(existing.min_val, val),
        max_val: Math.max(existing.max_val, val),
        units: units || existing.units,
      });
    }
  }

  const byMetric = new Map<string, MetricAgg>();
  let maxVelMen: BestMark | null = null;
  let maxVelWomen: BestMark | null = null;

  for (const [key, agg] of byAthleteMetric) {
    const [athlete_id, metric_key] = key.split("\t");
    if (!athlete_id || !metric_key) continue;
    const athlete = athletesById.get(athlete_id);
    if (!athlete) continue;
    const slot = genderSlot(athlete.gender);
    if (!slot) continue;

    const def = registry[metric_key];
    const unitsLower = (def?.display_units ?? agg.units ?? "").toLowerCase();
    const lowerIsBetter = unitsLower === "s";
    const value = lowerIsBetter ? agg.min_val : agg.max_val;
    const units = def?.display_units ?? agg.units ?? "";
    const displayName = def?.display_name ?? metric_key;
    const candidate: BestMark = { athlete_id, value };

    if (velocityKeys.includes(metric_key)) {
      const v = agg.max_val;
      if (slot === "men") {
        maxVelMen = considerBest(maxVelMen, { athlete_id, value: v }, false);
      } else {
        maxVelWomen = considerBest(maxVelWomen, { athlete_id, value: v }, false);
      }
    }

    const existing = byMetric.get(metric_key);
    if (!existing) {
      byMetric.set(metric_key, {
        display_name: displayName,
        units,
        lower_is_better: lowerIsBetter,
        men: slot === "men" ? candidate : null,
        women: slot === "women" ? candidate : null,
      });
    } else {
      existing[slot] = considerBest(existing[slot], candidate, lowerIsBetter);
    }
  }

  if (
    hasVelocityMetrics() &&
    (maxVelMen != null || maxVelWomen != null) &&
    !byMetric.has(maxVelKey)
  ) {
    byMetric.set(maxVelKey, {
      display_name: "Max Velocity",
      units: "mph",
      lower_is_better: false,
      men: maxVelMen,
      women: maxVelWomen,
    });
  }

  const rows: LeaderMetricRow[] = [];
  for (const [metric_key, v] of byMetric) {
    rows.push({
      metric_key,
      display_name: v.display_name,
      units: v.units,
      lower_is_better: v.lower_is_better,
      men: v.men
        ? toCell(athletesById.get(v.men.athlete_id)!, v.men.value)
        : null,
      women: v.women
        ? toCell(athletesById.get(v.women.athlete_id)!, v.women.value)
        : null,
    });
  }
  rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
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
