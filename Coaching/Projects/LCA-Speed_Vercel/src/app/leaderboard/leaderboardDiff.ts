import type { LeaderboardRow, LeaderboardAnimationTrigger } from "@/types";

/**
 * Returns a map of athlete_id -> animation trigger by diffing prev vs next rows.
 * When prev is null/undefined, returns empty Map (first load).
 * Priority: new-entry > new-entry-top-three > new-top-three > new-pb > new-sb > value-updated.
 */
export function computeLeaderboardTriggers(
  prevRows: LeaderboardRow[] | null | undefined,
  nextRows: LeaderboardRow[]
): Map<string, LeaderboardAnimationTrigger> {
  return new Map();
}
