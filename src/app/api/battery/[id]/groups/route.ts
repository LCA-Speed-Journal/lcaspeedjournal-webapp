/**
 * Assign one athlete to one testing team. Coach only.
 * A null group_key clears the athlete. Saving replaces any earlier teams.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { athleteOnRoster, setAthleteTestingGroup } from "@/lib/battery/group-store";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const athleteId = typeof body?.athlete_id === "string" ? body.athlete_id.trim() : "";
    const rawGroup = body?.group_key;
    const groupKey =
      rawGroup == null || rawGroup === ""
        ? null
        : typeof rawGroup === "string"
          ? rawGroup.trim()
          : "";
    if (!athleteId || groupKey === "") {
      return NextResponse.json({ error: "Choose an athlete and a team." }, { status: 400 });
    }

    const { rows } = await sql`
      SELECT hugo_group
      FROM testing_batteries
      WHERE id = ${id}
      LIMIT 1
    `;
    const hugoGroup = (rows[0] as { hugo_group?: string } | undefined)?.hugo_group;
    if (!hugoGroup) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (!(await athleteOnRoster(athleteId, String(hugoGroup)))) {
      return NextResponse.json({ error: "That athlete is not on this sport roster." }, { status: 400 });
    }

    const saved = await setAthleteTestingGroup(id, athleteId, groupKey);
    if (saved === "missing-group") {
      return NextResponse.json({ error: "That team is not on this battery." }, { status: 400 });
    }
    return NextResponse.json({ data: { athlete_id: athleteId, group_key: groupKey } });
  } catch (err) {
    if (isBatterySchemaMissing(err)) {
      return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
    }
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    console.error("PUT /api/battery/[id]/groups:", err);
    return NextResponse.json({ error: "Failed to save testing team" }, { status: 500 });
  }
}
