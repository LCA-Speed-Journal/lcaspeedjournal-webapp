export type LaneHeat = {
  heat: number;
  athlete_ids: string[];
  places: (number | null)[];
  is_final: boolean;
};

export type FrozenLaneSheet = {
  cutoff_after_heat: number | null;
  heats: LaneHeat[];
};

export type LaneSeedAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  place: number | null;
};

/**
 * Tested athletes stay in the order given (board order, ties already sharing a place).
 * Untested athletes follow, sorted by last name then first name, and still receive a heat.
 */
export function laneSeedIds(athletes: LaneSeedAthlete[]): string[] {
  const tested = athletes.filter((athlete) => athlete.place != null);
  const waiting = athletes
    .filter((athlete) => athlete.place == null)
    .toSorted(
      (a, b) =>
        a.last_name.localeCompare(b.last_name) ||
        a.first_name.localeCompare(b.first_name) ||
        a.athlete_id.localeCompare(b.athlete_id)
    );
  return [...tested, ...waiting].map((athlete) => athlete.athlete_id);
}

/**
 * Heat number to draw the cutoff line after.
 * That heat holds the last athlete whose place is at or under the cutoff.
 * Ties skip numbers and untested athletes have no place, so the next number
 * often does not exist. Everyone at the cutoff place stays above the line.
 * The next heat (a skipped place, or athletes with no place) is below it.
 * No line when nobody has a place at or under the cutoff.
 */
export function cutoffAfterHeat(
  heats: { heat: number; places: (number | null)[] }[],
  cutoff: number | null
): number | null {
  if (cutoff == null || cutoff <= 0) return null;
  let boundary: number | null = null;
  for (const heat of heats) {
    const qualifies = heat.places.some((place) => place != null && place <= cutoff);
    if (!qualifies) continue;
    if (boundary == null || heat.heat < boundary) boundary = heat.heat;
  }
  return boundary;
}

function finiteHeat(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function placeValue(raw: unknown): number | null | undefined {
  if (raw == null) return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function seedLanes(placeOrder: string[]): LaneHeat[] {
  const pairs: string[][] = [];
  for (let i = 0; i < placeOrder.length; i += 2) {
    pairs.push(placeOrder.slice(i, i + 2));
  }
  const heats = pairs.toReversed();
  return heats.map((athlete_ids, index) => ({
    heat: index + 1,
    athlete_ids,
    places: athlete_ids.map(() => null),
    is_final: index === heats.length - 1,
  }));
}

function athleteQualifies(athlete: LaneSeedAthlete, cutoff: number | null): boolean {
  return cutoff != null && cutoff > 0 && athlete.place != null && athlete.place <= cutoff;
}

/**
 * Places and the cutoff line from the board at freeze time.
 * Athletes at or under the cutoff are paired on their own, so a tie or an
 * untested athlete starts the next heat instead of sharing the cutoff heat.
 */
export function freezeLaneSheet(
  athletes: LaneSeedAthlete[],
  cutoff: number | null = 18
): FrozenLaneSheet {
  const byId = new Map(athletes.map((athlete) => [athlete.athlete_id, athlete]));
  const ordered = laneSeedIds(athletes).flatMap((id) => {
    const athlete = byId.get(id);
    return athlete ? [athlete] : [];
  });
  const qualifying = ordered.filter((athlete) => athleteQualifies(athlete, cutoff));
  const rest = ordered.filter((athlete) => !athleteQualifies(athlete, cutoff));
  const restHeats = seedLanes(rest.map((athlete) => athlete.athlete_id));
  const qualifyingHeats = seedLanes(qualifying.map((athlete) => athlete.athlete_id)).map((heat) => ({
    ...heat,
    heat: heat.heat + restHeats.length,
  }));
  const heats = [...restHeats, ...qualifyingHeats];
  const placeById = new Map(ordered.map((athlete) => [athlete.athlete_id, athlete.place]));
  const placed = heats.map((heat, index) => ({
    ...heat,
    places: heat.athlete_ids.map((id) => placeById.get(id) ?? null),
    is_final: index === heats.length - 1,
  }));
  return {
    heats: placed,
    cutoff_after_heat: cutoffAfterHeat(placed, cutoff),
  };
}

/**
 * The printed sheet uses the frozen places and the frozen cutoff.
 * A later live place map does not move the line or the place column.
 */
export function laneSheetFromFreeze(stored: FrozenLaneSheet): FrozenLaneSheet {
  return {
    cutoff_after_heat: stored.cutoff_after_heat,
    heats: stored.heats.map((heat) => ({
      heat: heat.heat,
      athlete_ids: [...heat.athlete_ids],
      places: [...heat.places],
      is_final: heat.is_final,
    })),
  };
}

export function parseFrozenLaneSheet(raw: unknown): FrozenLaneSheet | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as { heats?: unknown; cutoff_after_heat?: unknown };
  if (!Array.isArray(rec.heats)) return null;
  const heats: LaneHeat[] = [];
  for (const item of rec.heats) {
    if (item == null || typeof item !== "object") return null;
    const heatRec = item as {
      heat?: unknown;
      athlete_ids?: unknown;
      places?: unknown;
      is_final?: unknown;
    };
    const heat = finiteHeat(heatRec.heat);
    if (heat == null || !Array.isArray(heatRec.athlete_ids) || !Array.isArray(heatRec.places)) {
      return null;
    }
    if (heatRec.places.length !== heatRec.athlete_ids.length) return null;
    const places: (number | null)[] = [];
    for (const place of heatRec.places) {
      const parsed = placeValue(place);
      if (parsed === undefined) return null;
      places.push(parsed);
    }
    heats.push({
      heat,
      athlete_ids: heatRec.athlete_ids.map((id) => String(id)),
      places,
      is_final: heatRec.is_final === true,
    });
  }
  if (rec.cutoff_after_heat == null) {
    return { heats, cutoff_after_heat: null };
  }
  const cutoff = finiteHeat(rec.cutoff_after_heat);
  if (cutoff == null) return null;
  return { heats, cutoff_after_heat: cutoff };
}
