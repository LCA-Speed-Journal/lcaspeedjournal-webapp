import type { HugoGroup } from "@/lib/weight-room/constants";

async function getSql() {
  return (await import("@/lib/db")).sql;
}

export type MembershipRow = {
  athlete_id: string;
  hugo_group: string;
  is_primary?: boolean;
};

export type HugoTeamAthlete = {
  hugo_group?: string | null;
  hugo_groups?: string[] | null;
  hugo_primary?: string | null;
};

export function groupMembershipsByAthleteId(
  rows: MembershipRow[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.athlete_id);
    if (list) {
      if (!list.includes(row.hugo_group)) list.push(row.hugo_group);
    } else {
      map.set(row.athlete_id, [row.hugo_group]);
    }
  }
  return map;
}

export function attachHugoGroups<T extends { id: string }>(
  athletes: T[],
  memberships: MembershipRow[]
): Array<T & { hugo_groups: string[]; hugo_primary: string | null }> {
  const byId = groupMembershipsByAthleteId(memberships);
  const primaryById = new Map<string, string>();
  for (const row of memberships) {
    if (row.is_primary && !primaryById.has(row.athlete_id)) {
      primaryById.set(row.athlete_id, row.hugo_group);
    }
  }
  return athletes.map((athlete) => ({
    ...athlete,
    hugo_groups: byId.get(athlete.id) ?? [],
    hugo_primary: primaryById.get(athlete.id) ?? null,
  }));
}

/** True if the athlete has any membership, or a scalar hugo_group during rollout. */
export function isOnHugoTeam(athlete: HugoTeamAthlete): boolean {
  if (athlete.hugo_groups && athlete.hugo_groups.length > 0) return true;
  return Boolean(athlete.hugo_group);
}

export function athleteHasHugoGroup(
  athlete: HugoTeamAthlete,
  group: string
): boolean {
  if (athlete.hugo_groups?.includes(group)) return true;
  return athlete.hugo_group === group;
}

/** First membership added becomes the athlete's primary Hugo sport. */
export function shouldSetPrimaryOnFirstAdd(
  existingMembershipCount: number
): boolean {
  return existingMembershipCount === 0;
}

/**
 * End state after choosing a primary: only that group is true.
 * SQL still clears all then sets the chosen row (unique partial index).
 */
export function setPrimaryClearsOthers(
  groups: string[],
  primaryGroup: string
): Array<{ hugo_group: string; is_primary: boolean }> {
  return groups.map((hugo_group) => ({
    hugo_group,
    is_primary: hugo_group === primaryGroup,
  }));
}

/**
 * After a membership is removed, which group should be primary.
 * Empty remaining → none. Remaining already has a primary → keep it.
 * Otherwise promote the first remaining group sorted by hugo_group.
 */
export function nextPrimaryAfterRemove(
  remaining: Array<{ hugo_group: string; is_primary?: boolean }>
): string | null {
  if (remaining.length === 0) return null;
  const existing = remaining.find((row) => row.is_primary);
  if (existing) return existing.hugo_group;
  return [...remaining]
    .map((row) => row.hugo_group)
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export async function fetchMembershipsForAthletes(
  athleteIds: string[]
): Promise<MembershipRow[]> {
  if (athleteIds.length === 0) return [];
  const sql = await getSql();
  const { rows } = await sql`
    SELECT athlete_id, hugo_group, is_primary
    FROM athlete_hugo_memberships
    WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
    ORDER BY hugo_group
  `;
  return (rows as MembershipRow[]).map((row) => ({
    ...row,
    is_primary: Boolean(row.is_primary),
  }));
}

/** Rollout-only: memberships table or hugo_group column not migrated yet. */
export function isMissingRelationOrColumn(err: unknown): boolean {
  const msg = String(
    err instanceof Error ? err.message : err ?? ""
  ).toLowerCase();
  if (!msg.includes("does not exist")) return false;
  return msg.includes("relation") || msg.includes("column");
}

export async function attachHugoGroupsFromDb<T extends { id: string }>(
  athletes: T[]
): Promise<Array<T & { hugo_groups: string[]; hugo_primary: string | null }>> {
  try {
    const memberships = await fetchMembershipsForAthletes(
      athletes.map((a) => a.id)
    );
    return attachHugoGroups(athletes, memberships);
  } catch (err) {
    if (isMissingRelationOrColumn(err)) {
      console.error("attachHugoGroupsFromDb:", err);
      return athletes.map((athlete) => ({
        ...athlete,
        hugo_groups: [],
        hugo_primary: null,
      }));
    }
    throw err;
  }
}

/** Clear other primaries, then mark this membership primary. */
export async function setAthletePrimaryHugoGroup(
  athleteId: string,
  hugoGroup: HugoGroup
): Promise<boolean> {
  const sql = await getSql();
  const { rows: existing } = await sql`
    SELECT 1
    FROM athlete_hugo_memberships
    WHERE athlete_id = ${athleteId} AND hugo_group = ${hugoGroup}
    LIMIT 1
  `;
  if (existing.length === 0) return false;

  await sql`
    UPDATE athlete_hugo_memberships
    SET is_primary = false
    WHERE athlete_id = ${athleteId}
  `;
  await sql`
    UPDATE athlete_hugo_memberships
    SET is_primary = true
    WHERE athlete_id = ${athleteId} AND hugo_group = ${hugoGroup}
  `;
  return true;
}

/** Insert membership. Returns true when a new row was created. */
export async function insertHugoMembership(
  athleteId: string,
  hugoGroup: HugoGroup
): Promise<boolean> {
  const sql = await getSql();
  const hadAny = await athleteHasAnyMembership(athleteId);
  const { rows } = await sql`
    INSERT INTO athlete_hugo_memberships (athlete_id, hugo_group)
    VALUES (${athleteId}, ${hugoGroup})
    ON CONFLICT DO NOTHING
    RETURNING athlete_id
  `;
  if (rows.length > 0 && shouldSetPrimaryOnFirstAdd(hadAny ? 1 : 0)) {
    await setAthletePrimaryHugoGroup(athleteId, hugoGroup);
  }
  try {
    await sql`
      UPDATE athletes
      SET hugo_group = ${hugoGroup}
      WHERE id = ${athleteId} AND hugo_group IS NULL
    `;
  } catch (err) {
    console.error("insertHugoMembership: hugo_group cache:", err);
  }
  return rows.length > 0;
}

export async function athleteHasAnyMembership(
  athleteId: string
): Promise<boolean> {
  const sql = await getSql();
  const { rows } = await sql`
    SELECT 1
    FROM athlete_hugo_memberships
    WHERE athlete_id = ${athleteId}
    LIMIT 1
  `;
  return rows.length > 0;
}
