import { isZoneLabel } from "./palette";
import { resolveZone, type ZoneCut } from "./resolve-zone";

export type AttachZonesRow = {
  athlete_id: string;
  gender: string | null;
  display_value: number;
};

export type AttachZonesMembership = {
  athlete_id: string;
  hugo_group: string;
  is_primary: boolean;
};

export type AttachZonesDefault = {
  hugo_group: string;
  metric_key: string;
  population_id: string;
};

export type AttachZonesThreshold = {
  population_id: string;
  gender: string;
  component: string | null;
  label: string;
  threshold: number;
};

export type AttachZonesPopulation = {
  id: string;
  name: string;
};

export type ZoneAttachment = {
  zone_label?: string;
  zone_color?: string;
  population_name?: string;
};

/** Leaderboard-style gender: m/male → M, f/female → F. */
function normalizeGender(gender: string | null | undefined): "M" | "F" | null {
  const g = gender?.trim().toLowerCase();
  if (g === "m" || g === "male") return "M";
  if (g === "f" || g === "female") return "F";
  return null;
}

function isEmptyComponent(component: string | null | undefined): boolean {
  return component == null || component === "";
}

function componentMatches(
  cutComponent: string | null,
  wanted: string | null
): boolean {
  if (isEmptyComponent(wanted)) return isEmptyComponent(cutComponent);
  return cutComponent === wanted;
}

function pickPopulationId(
  athleteId: string,
  overridePopulationId: string | null | undefined,
  primaryGroupByAthlete: Map<string, string>,
  populationByGroup: Map<string, string>
): string | undefined {
  if (overridePopulationId) return overridePopulationId;
  const group = primaryGroupByAthlete.get(athleteId);
  if (!group) return undefined;
  return populationByGroup.get(group);
}

export function attachZones<T extends AttachZonesRow>(input: {
  rows: T[];
  memberships: AttachZonesMembership[];
  defaults: AttachZonesDefault[];
  thresholds: AttachZonesThreshold[];
  populations: AttachZonesPopulation[];
  metricKey: string;
  component: string | null;
  lowerIsBetter: boolean;
  overridePopulationId?: string | null;
}): Array<T & ZoneAttachment> {
  const primaryGroupByAthlete = new Map<string, string>();
  for (const membership of input.memberships) {
    if (membership.is_primary) {
      primaryGroupByAthlete.set(membership.athlete_id, membership.hugo_group);
    }
  }

  const populationByGroup = new Map<string, string>();
  for (const row of input.defaults) {
    if (row.metric_key === input.metricKey) {
      populationByGroup.set(row.hugo_group, row.population_id);
    }
  }

  const populationNameById = new Map(
    input.populations.map((p) => [p.id, p.name])
  );

  return input.rows.map((row) => {
    const populationId = pickPopulationId(
      row.athlete_id,
      input.overridePopulationId,
      primaryGroupByAthlete,
      populationByGroup
    );
    if (!populationId) return { ...row };

    const gender = normalizeGender(row.gender);
    if (!gender) return { ...row };

    const cuts: ZoneCut[] = [];
    for (const t of input.thresholds) {
      if (!isZoneLabel(t.label)) continue;
      if (t.population_id !== populationId) continue;
      if (normalizeGender(t.gender) !== gender) continue;
      if (!componentMatches(t.component, input.component)) continue;
      cuts.push({ label: t.label, threshold: t.threshold });
    }

    const hit = resolveZone({
      value: row.display_value,
      lowerIsBetter: input.lowerIsBetter,
      cuts,
    });
    if (!hit) return { ...row };

    return {
      ...row,
      zone_label: hit.label,
      zone_color: hit.color,
      population_name: populationNameById.get(populationId),
    };
  });
}
