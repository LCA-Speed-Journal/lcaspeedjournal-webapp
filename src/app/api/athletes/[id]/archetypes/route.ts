/**
 * Athlete archetypes API - GET (read), PUT (update).
 * RSI type, sprint archetype (James Wild), force-velocity scale (1-5).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

const RSI_TYPES = ["elastic", "force", "high_rsi", "low_rsi", "unset"] as const;
const SPRINT_ARCHETYPES = ["bouncer", "spinner", "bounder", "driver", "unset"] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    const { rows } = await sql`
      SELECT athlete_id, rsi_type, sprint_archetype, force_velocity_scale, created_at, updated_at
      FROM athlete_archetypes
      WHERE athlete_id = ${athleteId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({
        data: {
          athlete_id: athleteId,
          rsi_type: null,
          sprint_archetype: null,
          force_velocity_scale: null,
          created_at: null,
          updated_at: null,
        },
      });
    }
    const row = rows[0] as Record<string, unknown>;
    if (row?.created_at) row.created_at = String(row.created_at);
    if (row?.updated_at) row.updated_at = String(row.updated_at);
    return NextResponse.json({ data: row });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return NextResponse.json({
        data: {
          athlete_id: athleteId,
          rsi_type: null,
          sprint_archetype: null,
          force_velocity_scale: null,
          created_at: null,
          updated_at: null,
        },
      });
    }
    console.error("GET /api/athletes/[id]/archetypes:", err);
    return NextResponse.json(
      { error: "Failed to fetch archetypes" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: athleteId } = await params;
  try {
    const body = await request.json();
    let { rsi_type, sprint_archetype, force_velocity_scale } = body;

    if (rsi_type !== undefined) {
      if (rsi_type !== null && rsi_type !== "" && !RSI_TYPES.includes(rsi_type)) {
        return NextResponse.json(
          { error: `rsi_type must be one of: ${RSI_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      rsi_type = rsi_type === null || rsi_type === "" ? null : rsi_type;
    }
    if (sprint_archetype !== undefined) {
      if (sprint_archetype !== null && sprint_archetype !== "" && !SPRINT_ARCHETYPES.includes(sprint_archetype)) {
        return NextResponse.json(
          { error: `sprint_archetype must be one of: ${SPRINT_ARCHETYPES.join(", ")}` },
          { status: 400 }
        );
      }
      sprint_archetype = sprint_archetype === null || sprint_archetype === "" ? null : sprint_archetype;
    }
    if (force_velocity_scale !== undefined) {
      const n = force_velocity_scale === null || force_velocity_scale === "" ? null : Number(force_velocity_scale);
      if (n !== null && (Number.isNaN(n) || n < 1 || n > 5)) {
        return NextResponse.json(
          { error: "force_velocity_scale must be between 1 and 5 or null" },
          { status: 400 }
        );
      }
      force_velocity_scale = n;
    }

    let cur: Record<string, unknown> = {};
    try {
      const existing = await sql`
        SELECT rsi_type, sprint_archetype, force_velocity_scale FROM athlete_archetypes WHERE athlete_id = ${athleteId} LIMIT 1
      `;
      cur = (existing.rows[0] as Record<string, unknown> | undefined) ?? {};
    } catch {
      // Table may not exist yet (migration not run)
    }
    const finalRsi = rsi_type !== undefined ? rsi_type : (cur.rsi_type ?? null);
    const finalSprint = sprint_archetype !== undefined ? sprint_archetype : (cur.sprint_archetype ?? null);
    const finalScale = force_velocity_scale !== undefined ? force_velocity_scale : (cur.force_velocity_scale ?? null);

    const { rows } = await sql`
      INSERT INTO athlete_archetypes (athlete_id, rsi_type, sprint_archetype, force_velocity_scale, updated_at)
      VALUES (${athleteId}, ${finalRsi}, ${finalSprint}, ${finalScale}, NOW())
      ON CONFLICT (athlete_id) DO UPDATE SET
        rsi_type = ${finalRsi},
        sprint_archetype = ${finalSprint},
        force_velocity_scale = ${finalScale},
        updated_at = NOW()
      RETURNING athlete_id, rsi_type, sprint_archetype, force_velocity_scale, created_at, updated_at
    `;
    const row = rows[0] as Record<string, unknown>;
    if (row?.created_at) row.created_at = String(row.created_at);
    if (row?.updated_at) row.updated_at = String(row.updated_at);
    return NextResponse.json({ data: row });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return NextResponse.json(
        { error: "Archetypes table not found. Run the Phase A migration." },
        { status: 500 }
      );
    }
    console.error("PUT /api/athletes/[id]/archetypes:", err);
    return NextResponse.json(
      { error: "Failed to update archetypes" },
      { status: 500 }
    );
  }
}
