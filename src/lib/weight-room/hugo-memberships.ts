import type { HugoGroup } from "@/lib/weight-room/constants";

async function getSql() {
  return (await import("@/lib/db")).sql;
}

export type MembershipRow = {
  athlete_id: string;
  hugo_group: string;
};

export type HugoTeamAthlete = {
  hugo_group?: string | null;
  hugo_groups?: string[] | null;
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
): Array<T & { hugo_groups: string[] }> {
  const byId = groupMembershipsByAthleteId(memberships);
  return athletes.map((athlete) => ({
    ...athlete,
    hugo_groups: byId.get(athlete.id) ?? [],
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

export async function fetchMembershipsForAthletes(
  athleteIds: string[]
): Promise<MembershipRow[]> {
  if (athleteIds.length === 0) return [];
  const sql = await getSql();
  const { rows } = await sql`
    SELECT athlete_id, hugo_group
    FROM athlete_hugo_memberships
    WHERE athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
    ORDER BY hugo_group
  `;
  return rows as MembershipRow[];
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
): Promise<Array<T & { hugo_groups: string[] }>> {
  try {
    const memberships = await fetchMembershipsForAthletes(
      athletes.map((a) => a.id)
    );
    return attachHugoGroups(athletes, memberships);
  } catch (err) {
    if (isMissingRelationOrColumn(err)) {
      console.error("attachHugoGroupsFromDb:", err);
      return athletes.map((athlete) => ({ ...athlete, hugo_groups: [] }));
    }
    throw err;
  }
}

/** Insert membership. Returns true when a new row was created. */
export async function insertHugoMembership(
  athleteId: string,
  hugoGroup: HugoGroup
): Promise<boolean> {
  const sql = await getSql();
  const { rows } = await sql`
    INSERT INTO athlete_hugo_memberships (athlete_id, hugo_group)
    VALUES (${athleteId}, ${hugoGroup})
    ON CONFLICT DO NOTHING
    RETURNING athlete_id
  `;
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
