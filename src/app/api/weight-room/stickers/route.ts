import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { athleteHasAnyMembership } from "@/lib/weight-room/hugo-memberships";
import { encodeStickerPayload } from "@/lib/weight-room/qr-payload";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export async function GET() {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await sql`
      SELECT
        s.id,
        s.athlete_id,
        s.payload,
        s.active,
        s.created_at,
        a.first_name,
        a.last_name,
        a.hugo_group
      FROM athlete_stickers s
      JOIN athletes a ON a.id = s.athlete_id
      WHERE s.active = true
      ORDER BY a.last_name, a.first_name
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/weight-room/stickers:", err);
    return NextResponse.json(
      { error: "Failed to fetch stickers" },
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

    const rawAthleteId =
      body && typeof body === "object" && "athlete_id" in body
        ? (body as { athlete_id: unknown }).athlete_id
        : undefined;

    if (!isUuid(rawAthleteId)) {
      return NextResponse.json(
        { error: "athlete_id is required and must be a UUID" },
        { status: 400 }
      );
    }
    const athleteId = rawAthleteId.trim();

    const { rows: athleteRows } = await sql`
      SELECT id, first_name, last_name, hugo_group
      FROM athletes
      WHERE id = ${athleteId}
      LIMIT 1
    `;
    if (athleteRows.length === 0) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }

    const athlete = athleteRows[0] as {
      id: string;
      first_name: string;
      last_name: string;
      hugo_group: string | null;
    };
    const hasMembership = await athleteHasAnyMembership(athleteId);
    if (!hasMembership && athlete.hugo_group == null) {
      return NextResponse.json(
        { error: "Athlete is not assigned to a Hugo group" },
        { status: 400 }
      );
    }

    const { rows: existingRows } = await sql`
      SELECT
        s.id,
        s.athlete_id,
        s.payload,
        s.active,
        s.created_at,
        a.first_name,
        a.last_name,
        a.hugo_group
      FROM athlete_stickers s
      JOIN athletes a ON a.id = s.athlete_id
      WHERE s.athlete_id = ${athleteId} AND s.active = true
      LIMIT 1
    `;
    if (existingRows.length > 0) {
      return NextResponse.json({ data: existingRows[0] });
    }

    const id = crypto.randomUUID();
    const payload = encodeStickerPayload(id);
    const { rows: inserted } = await sql`
      INSERT INTO athlete_stickers (id, athlete_id, payload)
      VALUES (${id}, ${athleteId}, ${payload})
      RETURNING id, athlete_id, payload, active, created_at
    `;
    const row = inserted[0] as Record<string, unknown>;
    return NextResponse.json(
      {
        data: {
          ...row,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
          hugo_group: athlete.hugo_group,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/weight-room/stickers:", err);
    return NextResponse.json(
      { error: "Failed to issue sticker" },
      { status: 500 }
    );
  }
}
