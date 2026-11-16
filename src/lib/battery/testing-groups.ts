export const GROUPING_MODES = ["cutoff", "subteam"] as const;

export type GroupingMode = (typeof GROUPING_MODES)[number];

export const DEFAULT_TESTING_GROUPS = [
  { group_key: "varsity", label: "Varsity", sort_order: 1 },
  { group_key: "jv", label: "JV", sort_order: 2 },
  { group_key: "c_team", label: "C-team", sort_order: 3 },
] as const;

export function isGroupingMode(value: string): value is GroupingMode {
  return (GROUPING_MODES as readonly string[]).includes(value);
}

/** One dropdown value. Several memberships keep the earliest team. */
export function preferredGroupKey(
  memberships: readonly { group_key: string; sort_order: number }[]
): string | null {
  if (memberships.length === 0) return null;
  let best = memberships[0];
  for (let i = 1; i < memberships.length; i += 1) {
    const row = memberships[i];
    if (row.sort_order < best.sort_order || (row.sort_order === best.sort_order && row.group_key < best.group_key)) {
      best = row;
    }
  }
  return best.group_key;
}
