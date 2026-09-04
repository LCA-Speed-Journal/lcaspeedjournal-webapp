import {
  type AttachZonesDefault,
  type AttachZonesMembership,
} from "./attach-zones";
import {
  AGILITY_5105_CUT_COMPONENTS,
  NORMS_DEFAULTS_METRIC_KEYS,
  TWENTY_YD_COMPONENTS,
  TWENTY_YD_DASH,
} from "./editor-metrics";
import {
  AGILITY_5105,
  getPrimaryComponent,
  isPrimaryResultComponent,
} from "../metric-utils";
import { isZoneLabel, zoneRank, type ZoneLabel } from "./palette";
import type { F2fProfile } from "./f2f/types";
import type { F2fThemes } from "./f2f/themes";

export const FORTY_YARD_COMPONENTS = [
  "0-10yd",
  "0-20yd",
  "0-40yd",
  "10-20yd",
  "20-40yd",
  "0-5yd",
  "5-10yd",
] as const;

const EFFICIENT_RANK = zoneRank("efficient");

export type TestingDayHit = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  display_value: number;
  zone_label?: string;
  zone_color?: string;
};

export type TestingDayUnbadged = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  display_value: number;
};

export type TestingDayLabelCount = {
  label: ZoneLabel;
  count: number;
};

export type TestingDayGroup = {
  sport: string | null;
  gender: "M" | "F" | null;
  headcount: number;
  has_standard: boolean;
  label_counts: TestingDayLabelCount[];
  efficient_plus: number;
  unbadged: TestingDayUnbadged[];
};

export type SummarizeTestingDayInput = {
  rows: TestingDayHit[];
  memberships: AttachZonesMembership[];
  defaults: AttachZonesDefault[];
  metricKey: string;
  overridePopulationId?: string | null;
};

export type TestingDaySummaryData = {
  session_id: string;
  session_date: string;
  phase: string | null;
  metric: string;
  metric_display_name: string;
  component: string | null;
  units: string;
  selected_population_id: string | null;
  groups: TestingDayGroup[];
};

export type TestingDayColumnKind =
  | "test"
  | "derived_20yd"
  | "derived_max_v"
  | "total";

export type TestingDayMatrixColumn = {
  key: string;
  metric_key: string;
  display_name: string;
  component: string | null;
  units: string;
  kind?: TestingDayColumnKind;
};

export type TestingDayMatrixCell = {
  display_value: number;
  zone_label?: string;
  zone_color?: string;
  rank?: number | null;
  tied?: boolean;
  points?: number;
};

export type TestingDayMatrixAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | null;
  sport: string | null;
  cells: Record<string, TestingDayMatrixCell>;
  sprint_points?: number;
  total_points?: number;
  f2f?: F2fProfile;
};

export type TestingDayMatrix = {
  columns: TestingDayMatrixColumn[];
  athletes: TestingDayMatrixAthlete[];
};

export type TestingDayBoardData = {
  session_id: string;
  session_date: string;
  phase: string | null;
  selected_population_id: string | null;
  matrix: TestingDayMatrix;
  tests: Array<{
    column_key: string;
    metric: string;
    metric_display_name: string;
    component: string | null;
    units: string;
    groups: TestingDayGroup[];
  }>;
  f2f_themes?: F2fThemes;
};

/** Leaderboard-style gender: m/male → M, f/female → F. */
export function normalizeTestingDayGender(
  gender: string | null | undefined
): "M" | "F" | null {
  const g = gender?.trim().toLowerCase();
  if (g === "m" || g === "male") return "M";
  if (g === "f" || g === "female") return "F";
  return null;
}

function primarySportByAthlete(
  memberships: AttachZonesMembership[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const membership of memberships) {
    if (membership.is_primary) {
      map.set(membership.athlete_id, membership.hugo_group);
    }
  }
  return map;
}

function populationByGroup(
  defaults: AttachZonesDefault[],
  metricKey: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of defaults) {
    if (row.metric_key === metricKey) {
      map.set(row.hugo_group, row.population_id);
    }
  }
  return map;
}

function athleteHasStandard(
  athleteId: string,
  overridePopulationId: string | null | undefined,
  primaryGroup: Map<string, string>,
  defaultByGroup: Map<string, string>
): boolean {
  if (overridePopulationId) return true;
  const group = primaryGroup.get(athleteId);
  if (!group) return false;
  return defaultByGroup.has(group);
}

function groupKey(sport: string | null, gender: "M" | "F" | null): string {
  return `${sport ?? ""}\0${gender ?? ""}`;
}

function compareGroups(a: TestingDayGroup, b: TestingDayGroup): number {
  if (a.sport == null && b.sport != null) return 1;
  if (a.sport != null && b.sport == null) return -1;
  const sportCmp = (a.sport ?? "").localeCompare(b.sport ?? "");
  if (sportCmp !== 0) return sportCmp;
  const genderOrder = { M: 0, F: 1 } as const;
  const ag = a.gender == null ? 2 : genderOrder[a.gender];
  const bg = b.gender == null ? 2 : genderOrder[b.gender];
  return ag - bg;
}

function compareUnbadged(a: TestingDayUnbadged, b: TestingDayUnbadged): number {
  return (
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name) ||
    a.athlete_id.localeCompare(b.athlete_id)
  );
}

function emptyGroup(sport: string | null, gender: "M" | "F" | null): TestingDayGroup {
  return {
    sport,
    gender,
    headcount: 0,
    has_standard: false,
    label_counts: [],
    efficient_plus: 0,
    unbadged: [],
  };
}

/**
 * Group zoned testing-day hits by primary Hugo sport then gender.
 * Efficient+ = palette rank ≥ efficient among athletes who earned a badge.
 * Unbadged are excluded from Efficient+. Missing "efficient" on the table does
 * not invent it; advanced/elite/world-class still count.
 */
export function summarizeTestingDay(
  input: SummarizeTestingDayInput
): TestingDayGroup[] {
  const primaryGroup = primarySportByAthlete(input.memberships);
  const defaultByGroup = populationByGroup(input.defaults, input.metricKey);
  const buckets = new Map<string, TestingDayGroup>();

  for (const row of input.rows) {
    const sport = primaryGroup.get(row.athlete_id) ?? null;
    const gender = normalizeTestingDayGender(row.gender);
    const key = groupKey(sport, gender);
    let group = buckets.get(key);
    if (!group) {
      group = emptyGroup(sport, gender);
      buckets.set(key, group);
    }

    group.headcount += 1;
    if (
      athleteHasStandard(
        row.athlete_id,
        input.overridePopulationId,
        primaryGroup,
        defaultByGroup
      )
    ) {
      group.has_standard = true;
    }

    const label = row.zone_label;
    if (label && isZoneLabel(label) && group.has_standard) {
      const existing = group.label_counts.find((c) => c.label === label);
      if (existing) existing.count += 1;
      else group.label_counts.push({ label, count: 1 });
      if (zoneRank(label) >= EFFICIENT_RANK) {
        group.efficient_plus += 1;
      }
    } else {
      group.unbadged.push({
        athlete_id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        display_value: row.display_value,
      });
    }
  }

  const groups = Array.from(buckets.values());
  for (const group of groups) {
    if (!group.has_standard) {
      group.label_counts = [];
      group.efficient_plus = 0;
    } else {
      group.label_counts.sort(
        (a, b) => zoneRank(a.label) - zoneRank(b.label)
      );
    }
    group.unbadged.sort(compareUnbadged);
  }

  groups.sort(compareGroups);
  return groups;
}

export function testingDayColumnKey(
  metricKey: string,
  component: string | null
): string {
  return `${metricKey}\0${component ?? ""}`;
}

export function sortTestingDayMetricKeys(keys: string[]): string[] {
  const unique = Array.from(new Set(keys));
  const preferred = NORMS_DEFAULTS_METRIC_KEYS as readonly string[];
  const preferredSet = new Set(preferred);
  const head = preferred.filter((key) => unique.includes(key));
  const rest = unique
    .filter((key) => !preferredSet.has(key))
    .sort((a, b) => a.localeCompare(b));
  return [...head, ...rest];
}

export function entryMatchesTestingDayComponent(
  row: { component: string | null; interval_index: number | null },
  resolvedComponent: string | null,
  metricKey?: string
): boolean {
  if (resolvedComponent == null) {
    if (metricKey && isPrimaryResultComponent(metricKey, row.component)) {
      return row.interval_index == null;
    }
    return (
      row.interval_index == null &&
      (row.component == null || row.component === "")
    );
  }
  return row.component === resolvedComponent;
}

export function pickBestTestingDayHits<
  T extends { athlete_id: string; display_value: number },
>(rows: T[], lowerIsBetter: boolean): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const prev = best.get(row.athlete_id);
    if (!prev) {
      best.set(row.athlete_id, row);
      continue;
    }
    const better = lowerIsBetter
      ? row.display_value < prev.display_value
      : row.display_value > prev.display_value;
    if (better) best.set(row.athlete_id, row);
  }
  return Array.from(best.values());
}

export function buildTestingDayMatrix(input: {
  columns: TestingDayMatrixColumn[];
  hitsByColumn: Record<string, TestingDayHit[]>;
  memberships: AttachZonesMembership[];
}): TestingDayMatrix {
  const sportByAthlete = primarySportByAthlete(input.memberships);
  const athletes = new Map<string, TestingDayMatrixAthlete>();

  for (const column of input.columns) {
    const hits = input.hitsByColumn[column.key] ?? [];
    for (const row of hits) {
      let athlete = athletes.get(row.athlete_id);
      if (!athlete) {
        athlete = {
          athlete_id: row.athlete_id,
          first_name: row.first_name,
          last_name: row.last_name,
          gender: normalizeTestingDayGender(row.gender),
          sport: sportByAthlete.get(row.athlete_id) ?? null,
          cells: {},
        };
        athletes.set(row.athlete_id, athlete);
      }
      athlete.cells[column.key] = {
        display_value: row.display_value,
        zone_label: row.zone_label,
        zone_color: row.zone_color,
      };
    }
  }

  const list = Array.from(athletes.values()).sort(
    (a, b) =>
      a.last_name.localeCompare(b.last_name) ||
      a.first_name.localeCompare(b.first_name) ||
      a.athlete_id.localeCompare(b.athlete_id)
  );

  return { columns: input.columns, athletes: list };
}

export function testingDayComponentParam(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Empty/omitted component → primary split for cumulatives (0-40m, 0-40yd, …).
 * Single-interval metrics stay null (overall / NULL-component rows).
 */
export function resolveTestingDayComponent(
  metricKey: string,
  raw: string | null | undefined
): string | null {
  const explicit = testingDayComponentParam(raw);
  if (explicit) return explicit;
  return getPrimaryComponent(metricKey);
}

export type TestingDaySessionComponent = {
  component: string | null;
  label?: string;
};

/**
 * Named components for the picker. Prefers session-metrics entries; skips Overall.
 * Empty session list falls back to the 40yd named set or the cumulative primary.
 */
export function testingDayNamedComponents(
  metricKey: string,
  sessionComponents: TestingDaySessionComponent[]
): string[] {
  const named: string[] = [];
  const seen = new Set<string>();
  for (const row of sessionComponents) {
    const value = row.component?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    named.push(value);
  }
  if (named.length > 0) return named;
  if (metricKey === "40yd_Dash") return [...FORTY_YARD_COMPONENTS];
  if (metricKey === TWENTY_YD_DASH) return [...TWENTY_YD_COMPONENTS];
  if (metricKey === AGILITY_5105) return [...AGILITY_5105_CUT_COMPONENTS];
  const primary = getPrimaryComponent(metricKey);
  return primary ? [primary] : [];
}
