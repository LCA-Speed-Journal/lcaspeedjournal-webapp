import { sql, withTransaction, type DbSql } from "@/lib/db";
import { DEFAULT_TESTING_GROUPS, type GroupingMode } from "./testing-groups";

async function groupCount(db: DbSql, batteryId: string): Promise<number> {
  const { rows } = await db`
    SELECT COUNT(*)::int AS n
    FROM testing_battery_groups
    WHERE battery_id = ${batteryId}
  `;
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
}

/** Varsity, JV, and C-team, only when this battery has no teams yet. */
export async function ensureDefaultGroups(batteryId: string): Promise<void> {
  if ((await groupCount(sql, batteryId)) > 0) return;
  await withTransaction(async (tx) => {
    if ((await groupCount(tx, batteryId)) > 0) return;
    for (const group of DEFAULT_TESTING_GROUPS) {
      await tx`
        INSERT INTO testing_battery_groups (battery_id, group_key, label, sort_order)
        VALUES (${batteryId}, ${group.group_key}, ${group.label}, ${group.sort_order})
        ON CONFLICT (battery_id, group_key) DO NOTHING
      `;
    }
  });
}

export async function setGroupingMode(batteryId: string, mode: GroupingMode): Promise<boolean> {
  if (mode === "subteam") await ensureDefaultGroups(batteryId);
  const { rows } = await sql`
    UPDATE testing_batteries
    SET grouping_mode = ${mode}
    WHERE id = ${batteryId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function athleteOnRoster(athleteId: string, hugoGroup: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1
    FROM athlete_hugo_memberships
    WHERE athlete_id = ${athleteId}
      AND hugo_group = ${hugoGroup}
    LIMIT 1
  `;
  return rows.length > 0;
}

/** One team per athlete on this battery. Null clears the assignment. */
export async function setAthleteTestingGroup(
  batteryId: string,
  athleteId: string,
  groupKey: string | null
): Promise<"ok" | "missing-group"> {
  return withTransaction(async (tx) => {
    if (groupKey != null) {
      const { rows } = await tx`
        SELECT id
        FROM testing_battery_groups
        WHERE battery_id = ${batteryId}
          AND group_key = ${groupKey}
        LIMIT 1
      `;
      if (!rows.length) return "missing-group";
    }
    await tx`
      DELETE FROM testing_battery_group_members AS m
      USING testing_battery_groups AS g
      WHERE m.group_id = g.id
        AND g.battery_id = ${batteryId}
        AND m.athlete_id = ${athleteId}
    `;
    if (groupKey == null) return "ok";
    await tx`
      INSERT INTO testing_battery_group_members (group_id, athlete_id)
      SELECT id, ${athleteId}::uuid
      FROM testing_battery_groups
      WHERE battery_id = ${batteryId}
        AND group_key = ${groupKey}
    `;
    return "ok";
  });
}
