import {
  attachZones,
  type AttachZonesDefault,
  type AttachZonesMembership,
  type AttachZonesPopulation,
  type AttachZonesRow,
  type AttachZonesThreshold,
  type ZoneAttachment,
} from "./attach-zones";
import { isZoneLabel, ZONE_LABELS, type ZoneLabel } from "./palette";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type ParsePopulationIdResult =
  | { ok: true; populationId: string | null }
  | { ok: false; error: string };

export function parsePopulationIdParam(
  raw: string | null | undefined
): ParsePopulationIdResult {
  if (raw == null) return { ok: true, populationId: null };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, populationId: null };
  if (!isUuid(trimmed)) {
    return { ok: false, error: "Invalid population_id" };
  }
  return { ok: true, populationId: trimmed };
}

export type ResolveSelectedPopulationResult =
  | { ok: true; selectedPopulationId: string | null }
  | { ok: false; error: string };

export function resolveSelectedPopulation(
  populationId: string | null,
  populations: AttachZonesPopulation[]
): ResolveSelectedPopulationResult {
  if (populationId == null) {
    return { ok: true, selectedPopulationId: null };
  }
  const found = populations.some((p) => p.id === populationId);
  if (!found) {
    return { ok: false, error: "Population not found" };
  }
  return { ok: true, selectedPopulationId: populationId };
}

export type LeaderboardZoneRow<T extends AttachZonesRow> = T &
  ZoneAttachment & { population_id?: string };

export type LeaderboardZonesResult<T extends AttachZonesRow> = {
  rows: Array<LeaderboardZoneRow<T>>;
  populations: AttachZonesPopulation[];
  selected_population_id: string | null;
};

export function applyLeaderboardZones<T extends AttachZonesRow>(input: {
  rows: T[];
  memberships: AttachZonesMembership[];
  defaults: AttachZonesDefault[];
  thresholds: AttachZonesThreshold[];
  populations: AttachZonesPopulation[];
  metricKey: string;
  component: string | null;
  lowerIsBetter: boolean;
  overridePopulationId?: string | null;
}): LeaderboardZonesResult<T> {
  const zoned = attachZones(input);
  const nameToId = new Map(input.populations.map((p) => [p.name, p.id]));
  const rows: Array<LeaderboardZoneRow<T>> = zoned.map((row) => {
    if (!row.population_name) return row;
    const population_id = nameToId.get(row.population_name);
    if (!population_id) return row;
    return { ...row, population_id };
  });

  return {
    rows,
    populations: input.populations,
    selected_population_id: input.overridePopulationId ?? null,
  };
}

export type RawThresholdRow = {
  population_id: string;
  gender: string;
  component: string | null;
  label: string;
  threshold: string | number;
};

export function mapThresholdRows(rows: RawThresholdRow[]): AttachZonesThreshold[] {
  return rows.map((row) => ({
    population_id: row.population_id,
    gender: row.gender,
    component: row.component === "" ? null : row.component,
    label: row.label,
    threshold: Number(row.threshold),
  }));
}

export function uniqueZoneLabels(
  rows: Array<{ zone_label?: string }>
): ZoneLabel[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.zone_label) seen.add(row.zone_label);
  }
  return ZONE_LABELS.filter((label) => seen.has(label) && isZoneLabel(label));
}
