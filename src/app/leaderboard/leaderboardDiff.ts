import type { LeaderboardRow, LeaderboardAnimationTrigger } from "@/types";

const TOP_THREE = new Set([1, 2, 3]);

function wasInTopThree(rows: LeaderboardRow[], athleteId: string): boolean {
  const r = rows.find((row) => row.athlete_id === athleteId);
  return r != null && TOP_THREE.has(r.rank);
}

function isTopThree(rank: number): boolean {
  return TOP_THREE.has(rank);
}

/**
 * Returns a map of athlete_id -> animation trigger by diffing prev vs next rows.
 * When prev is null/undefined, returns empty Map (first load).
 * Priority: new-entry > new-entry-top-three > new-top-three > new-pb > new-sb > value-updated.
 */
export function computeLeaderboardTriggers(
  prevRows: LeaderboardRow[] | null | undefined,
  nextRows: LeaderboardRow[]
): Map<string, LeaderboardAnimationTrigger> {
  const result = new Map<string, LeaderboardAnimationTrigger>();
  if (prevRows == null || prevRows === undefined) return result;
  const prevByAthlete = new Map(prevRows.map((r) => [r.athlete_id, r]));

  for (const next of nextRows) {
    const prev = prevByAthlete.get(next.athlete_id);
    if (prev == null) {
      result.set(next.athlete_id, isTopThree(next.rank) ? "new-entry-top-three" : "new-entry");
      continue;
    }
    const inTopThreeNow = isTopThree(next.rank);
    const inTopThreePrev = wasInTopThree(prevRows, next.athlete_id);
    if (!inTopThreePrev && inTopThreeNow) {
      result.set(next.athlete_id, "new-top-three");
      continue;
    }
    if (next.best_type === "pb" && prev.best_type !== "pb") {
      result.set(next.athlete_id, "new-pb");
      continue;
    }
    if (next.best_type === "sb" && prev.best_type !== "sb") {
      result.set(next.athlete_id, "new-sb");
      continue;
    }
    if (prev.display_value !== next.display_value) {
      result.set(next.athlete_id, "value-updated");
    }
  }
  return result;
}
