export type LaneHeat = {
  heat: number;
  athlete_ids: string[];
  is_final: boolean;
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

export function parseLaneHeats(raw: unknown): LaneHeat[] | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const heats: LaneHeat[] = [];
  for (const item of value) {
    if (item == null || typeof item !== "object") return null;
    const rec = item as { heat?: unknown; athlete_ids?: unknown; is_final?: unknown };
    const heat = typeof rec.heat === "number" ? rec.heat : Number(rec.heat);
    if (!Number.isFinite(heat) || !Array.isArray(rec.athlete_ids)) return null;
    heats.push({
      heat,
      athlete_ids: rec.athlete_ids.map((id) => String(id)),
      is_final: rec.is_final === true,
    });
  }
  return heats;
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
    is_final: index === heats.length - 1,
  }));
}
