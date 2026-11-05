import type { BoardAthlete } from "./load";

export type BoardRow = {
  athlete: BoardAthlete;
  place: number | null;
  untested: boolean;
};

function tieKey(athlete: BoardAthlete): string {
  return `${athlete.total_points}|${athlete.slots_completed}`;
}

function compareBoardAthletes(a: BoardAthlete, b: BoardAthlete): number {
  if (a.total_points !== b.total_points) return b.total_points - a.total_points;
  if (a.slots_completed !== b.slots_completed) return b.slots_completed - a.slots_completed;
  const byLast = a.last_name.localeCompare(b.last_name);
  if (byLast !== 0) return byLast;
  const byFirst = a.first_name.localeCompare(b.first_name);
  if (byFirst !== 0) return byFirst;
  return a.athlete_id.localeCompare(b.athlete_id);
}

/** Places among athletes who have a mark. Ties share a place and the next place skips. */
export function orderBoard(athletes: BoardAthlete[], untestedIds: string[]): BoardRow[] {
  const untested = new Set(untestedIds);
  const tested = athletes
    .filter((athlete) => !untested.has(athlete.athlete_id))
    .toSorted(compareBoardAthletes);
  const waiting = athletes.filter((athlete) => untested.has(athlete.athlete_id));
  let place = 0;
  let previousKey: string | null = null;
  const testedRows = tested.map((athlete, index) => {
    const key = tieKey(athlete);
    if (key !== previousKey) {
      place = index + 1;
      previousKey = key;
    }
    return { athlete, place, untested: false as const };
  });
  return [
    ...testedRows,
    ...waiting.map((athlete) => ({ athlete, place: null, untested: true as const })),
  ];
}
