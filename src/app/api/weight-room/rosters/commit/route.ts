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

type CommitRowError = {
  index: number;
  error: string;
  athlete_id?: string;
};

function rowErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Failed to commit row";
}

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

    let added = 0;
    let created = 0;
    const errors: CommitRowError[] = [];
    const graduatingClass = new Date().getFullYear() + 2;

    for (let index = 0; index < parsed.rows.length; index++) {
      const row = parsed.rows[index];
      let athleteId = row.athlete_id;
      let createdThisRow = false;
      try {
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
          createdThisRow = true;
        }
        if (!athleteId) {
          errors.push({ index, error: "each row needs athlete_id or create" });
          continue;
        }
        if (!createdThisRow) {
          const { rows: athleteRows } = await sql`
            SELECT id FROM athletes WHERE id = ${athleteId} LIMIT 1
          `;
          if (athleteRows.length === 0) {
            errors.push({
              index,
              error: "Athlete not found",
              athlete_id: athleteId,
            });
            continue;
          }
        }

        const inserted = await insertHugoMembership(athleteId, rec.hugo_group);
        if (inserted) added += 1;
        if (createdThisRow) created += 1;
      } catch (err) {
        console.error(
          `POST /api/weight-room/rosters/commit row ${index}:`,
          err
        );
        const entry: CommitRowError = {
          index,
          error: rowErrorMessage(err),
        };
        if (athleteId) entry.athlete_id = athleteId;
        errors.push(entry);
      }
    }

    return NextResponse.json({ data: { added, created, errors } });
  } catch (err) {
    console.error("POST /api/weight-room/rosters/commit:", err);
    return NextResponse.json(
      { error: "Failed to commit roster" },
      { status: 500 }
    );
  }
}
