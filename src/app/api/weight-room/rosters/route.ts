import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";
import {
  attachHugoGroupsFromDb,
  insertHugoMembership,
} from "@/lib/weight-room/hugo-memberships";
import { isUuid } from "@/lib/weight-room/insert-template";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const hugoGroupRaw = new URL(request.url).searchParams.get("hugo_group");
    if (!isHugoGroup(hugoGroupRaw)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      SELECT
        a.id,
        a.first_name,
        a.last_name,
        m.hugo_group
      FROM athlete_hugo_memberships m
      JOIN athletes a ON a.id = m.athlete_id
      WHERE m.hugo_group = ${hugoGroupRaw} AND a.active = true
      ORDER BY a.last_name, a.first_name
    `;

    const athletes = await attachHugoGroupsFromDb(
      rows as Array<{
        id: string;
        first_name: string;
        last_name: string;
        hugo_group: string;
      }>
    );
    return NextResponse.json({ data: athletes });
  } catch (err) {
    console.error("GET /api/weight-room/rosters:", err);
    return NextResponse.json(
      { error: "Failed to fetch roster" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rec =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};
    const athleteId = rec.athlete_id;
    const hugoGroupRaw = rec.hugo_group;

    if (!isUuid(athleteId)) {
      return NextResponse.json(
        { error: "athlete_id is required and must be a UUID" },
        { status: 400 }
      );
    }
    if (!isHugoGroup(hugoGroupRaw)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }

    const { rows: athleteRows } = await sql`
      SELECT id FROM athletes WHERE id = ${athleteId.trim()} LIMIT 1
    `;
    if (athleteRows.length === 0) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }

    await insertHugoMembership(athleteId.trim(), hugoGroupRaw);
    return NextResponse.json(
      { data: { athlete_id: athleteId.trim(), hugo_group: hugoGroupRaw } },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/weight-room/rosters:", err);
    return NextResponse.json(
      { error: "Failed to add membership" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get("athlete_id");
    const hugoGroupRaw = searchParams.get("hugo_group");

    if (!isUuid(athleteId)) {
      return NextResponse.json(
        { error: "athlete_id is required and must be a UUID" },
        { status: 400 }
      );
    }
    if (!isHugoGroup(hugoGroupRaw)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }

    const { rows: deleted } = await sql`
      DELETE FROM athlete_hugo_memberships
      WHERE athlete_id = ${athleteId.trim()} AND hugo_group = ${hugoGroupRaw}
      RETURNING athlete_id, hugo_group
    `;
    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 }
      );
    }

    try {
      const { rows: scalarRows } = await sql`
        SELECT hugo_group FROM athletes WHERE id = ${athleteId.trim()} LIMIT 1
      `;
      const scalar = (scalarRows[0] as { hugo_group: string | null } | undefined)
        ?.hugo_group;
      if (scalar === hugoGroupRaw) {
        const { rows: remaining } = await sql`
          SELECT hugo_group
          FROM athlete_hugo_memberships
          WHERE athlete_id = ${athleteId.trim()}
          ORDER BY created_at
          LIMIT 1
        `;
        const next =
          remaining.length > 0
            ? (remaining[0] as { hugo_group: string }).hugo_group
            : null;
        await sql`
          UPDATE athletes SET hugo_group = ${next} WHERE id = ${athleteId.trim()}
        `;
      }
    } catch (err) {
      console.error("DELETE /api/weight-room/rosters: hugo_group cache:", err);
    }

    return NextResponse.json({
      data: { athlete_id: athleteId.trim(), hugo_group: hugoGroupRaw },
    });
  } catch (err) {
    console.error("DELETE /api/weight-room/rosters:", err);
    return NextResponse.json(
      { error: "Failed to remove membership" },
      { status: 500 }
    );
  }
}
