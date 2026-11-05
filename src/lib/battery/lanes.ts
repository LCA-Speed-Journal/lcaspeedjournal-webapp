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
 * The line sits between the heat that contains place 18 and the heat that contains place 19.
 * Those heats are neighbors: 17 is paired with 18, and 19 is paired with 20.
 */
export function cutoffAfterHeat(
  heats: { heat: number; places: (number | null)[] }[]
): number | null {
  const heats18 = heats.filter((heat) => heat.places.includes(18)).map((heat) => heat.heat);
  const heats19 = heats.filter((heat) => heat.places.includes(19)).map((heat) => heat.heat);
  let boundary: number | null = null;
  for (const heat18 of heats18) {
    for (const heat19 of heats19) {
      if (heat18 === heat19) continue;
      const earlier = Math.min(heat18, heat19);
      const later = Math.max(heat18, heat19);
      if (later !== earlier + 1) continue;
      boundary = earlier;
    }
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

/** Places and the cutoff line from the board at freeze time. Untested athletes have no place. */
export function freezeLaneSheet(athletes: LaneSeedAthlete[]): FrozenLaneSheet {
  const placeById = new Map(athletes.map((athlete) => [athlete.athlete_id, athlete.place]));
  const heats = seedLanes(laneSeedIds(athletes)).map((heat) => ({
    ...heat,
    places: heat.athlete_ids.map((id) => placeById.get(id) ?? null),
  }));
  return {
    heats,
    cutoff_after_heat: cutoffAfterHeat(
      heats.map((heat) => ({ heat: heat.heat, places: heat.places }))
    ),
  };
}

/**
 * The printed sheet uses the frozen places and the frozen cutoff.
 * A later live place map does not move the line or the place column.
 */
export function laneSheetFromFreeze(
  stored: FrozenLaneSheet,
  _livePlaces: ReadonlyMap<string, number | null>
): FrozenLaneSheet {
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
