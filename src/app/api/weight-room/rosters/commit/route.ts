import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { insertHugoMembership } from "@/lib/weight-room/hugo-memberships";
import { isUuid } from "@/lib/weight-room/insert-template";

type CommitRow = {
  first_name: string;
  last_name: string;
  athlete_id?: string;
  create?: boolean;
};

function parseCommitRows(
  raw: unknown
): { ok: true; rows: CommitRow[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "rows must be an array" };
  }
  const rows: CommitRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "each row must be an object" };
    }
    const rec = item as Record<string, unknown>;
    const first_name = typeof rec.first_name === "string" ? rec.first_name.trim() : "";
    const last_name = typeof rec.last_name === "string" ? rec.last_name.trim() : "";
    const athleteId =
      typeof rec.athlete_id === "string" && rec.athlete_id.trim()
        ? rec.athlete_id.trim()
        : undefined;
    const create = rec.create === true;

    if (!athleteId && !create) {
      return { ok: false, error: "each row needs athlete_id or create" };
    }
    if (athleteId && !isUuid(athleteId)) {
      return { ok: false, error: "athlete_id must be a UUID" };
    }
    if (create && !athleteId && (!first_name || !last_name)) {
      return { ok: false, error: "create requires first_name and last_name" };
    }

    rows.push({
      first_name,
      last_name,
      athlete_id: athleteId,
      create: athleteId ? undefined : create,
    });
  }
  return { ok: true, rows };
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

    if (!isHugoGroup(rec.hugo_group)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
        { status: 400 }
      );
    }

    const parsed = parseCommitRows(rec.rows);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const existingIds = [
      ...new Set(
        parsed.rows
          .map((row) => row.athlete_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    if (existingIds.length > 0) {
      const { rows: found } = await sql`
        SELECT id FROM athletes
        WHERE id = ANY(${existingIds as unknown as string}::uuid[])
      `;
      if (found.length !== existingIds.length) {
        return NextResponse.json(
          { error: "Athlete not found" },
          { status: 404 }
        );
      }
    }

    let added = 0;
    let created = 0;
    const graduatingClass = new Date().getFullYear() + 2;

    for (const row of parsed.rows) {
      let athleteId = row.athlete_id;
      if (!athleteId && row.create) {
        const { rows: inserted } = await sql`
          INSERT INTO athletes (
            first_name, last_name, gender, graduating_class, athlete_type, active
          )
          VALUES (
            ${row.first_name},
            ${row.last_name},
            ${"M"},
            ${graduatingClass},
            ${"athlete"},
            true
          )
          RETURNING id
        `;
        athleteId = (inserted[0] as { id: string }).id;
        created += 1;
      }
      if (!athleteId) continue;

      const inserted = await insertHugoMembership(athleteId, rec.hugo_group);
      if (inserted) added += 1;
    }

    return NextResponse.json({ data: { added, created } });
  } catch (err) {
    console.error("POST /api/weight-room/rosters/commit:", err);
    return NextResponse.json(
      { error: "Failed to commit roster" },
      { status: 500 }
    );
  }
}
