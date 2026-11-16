/**
 * Testing-team lists for one sport. Coach only.
 * Opening this creates Varsity, JV, and C-team the first time a battery has none.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing } from "@/lib/battery/load";
import { ensureDefaultGroups } from "@/lib/battery/group-store";
import { preferredGroupKey } from "@/lib/battery/testing-groups";
import { isHugoGroup } from "@/lib/weight-room/constants";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

type BatteryRow = {
  id: string;
  title: string;
  grouping_mode: string;
  cutoff_n: number | null;
};

type GroupRow = {
  battery_id: string;
  group_key: string;
  label: string;
  sort_order: number;
};

type MemberRow = {
  battery_id: string;
  athlete_id: string;
  group_key: string;
  sort_order: number;
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hugoGroup = new URL(request.url).searchParams.get("hugo_group")?.trim() ?? "";
  if (!isHugoGroup(hugoGroup)) {
    return NextResponse.json({ error: "Choose a sport." }, { status: 400 });
  }

  try {
    const { rows } = await sql`
      SELECT id, title, grouping_mode, cutoff_n
      FROM testing_batteries
      WHERE hugo_group = ${hugoGroup}
      ORDER BY created_at DESC
    `;
    const batteries = rows as BatteryRow[];
    await Promise.all(batteries.map((battery) => ensureDefaultGroups(String(battery.id))));
    if (batteries.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const ids = batteries.map((battery) => String(battery.id));
    const [groupResult, memberResult] = await Promise.all([
      sql`
        SELECT battery_id, group_key, label, sort_order
        FROM testing_battery_groups
        WHERE battery_id = ANY(${ids as unknown as string}::uuid[])
        ORDER BY sort_order ASC, group_key ASC
      `,
      sql`
        SELECT g.battery_id, m.athlete_id, g.group_key, g.sort_order
        FROM testing_battery_group_members m
        INNER JOIN testing_battery_groups g ON g.id = m.group_id
        WHERE g.battery_id = ANY(${ids as unknown as string}::uuid[])
      `,
    ]);

    const groupsByBattery = new Map<string, GroupRow[]>();
    for (const row of groupResult.rows as GroupRow[]) {
      const batteryId = String(row.battery_id);
      const list = groupsByBattery.get(batteryId);
      const next = {
        battery_id: batteryId,
        group_key: String(row.group_key),
        label: String(row.label),
        sort_order: Number(row.sort_order),
      };
      if (list) list.push(next);
      else groupsByBattery.set(batteryId, [next]);
    }

    const membersByBattery = new Map<string, Map<string, { group_key: string; sort_order: number }[]>>();
    for (const row of memberResult.rows as MemberRow[]) {
      const batteryId = String(row.battery_id);
      const athleteId = String(row.athlete_id);
      let byAthlete = membersByBattery.get(batteryId);
      if (!byAthlete) {
        byAthlete = new Map();
        membersByBattery.set(batteryId, byAthlete);
      }
      const memberships = byAthlete.get(athleteId);
      const next = { group_key: String(row.group_key), sort_order: Number(row.sort_order) };
      if (memberships) memberships.push(next);
      else byAthlete.set(athleteId, [next]);
    }

    return NextResponse.json({
      data: batteries.map((battery) => {
        const batteryId = String(battery.id);
        const cutoff = battery.cutoff_n == null ? null : Number(battery.cutoff_n);
        const assignments: Record<string, string> = {};
        for (const [athleteId, memberships] of membersByBattery.get(batteryId) ?? []) {
          const key = preferredGroupKey(memberships);
          if (key) assignments[athleteId] = key;
        }
        return {
          id: batteryId,
          title: String(battery.title ?? ""),
          grouping_mode: String(battery.grouping_mode ?? ""),
          cutoff_n: cutoff != null && Number.isFinite(cutoff) ? cutoff : null,
          groups: (groupsByBattery.get(batteryId) ?? []).map((group) => ({
            group_key: group.group_key,
            label: group.label,
            sort_order: group.sort_order,
          })),
          assignments,
        };
      }),
    });
  } catch (err) {
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    console.error("GET /api/battery/groups:", err);
    return NextResponse.json({ error: "Failed to load testing teams" }, { status: 500 });
  }
}
