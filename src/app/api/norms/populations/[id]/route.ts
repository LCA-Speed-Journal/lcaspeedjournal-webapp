/**
 * Coach PATCH for a single norm population: rename, notes, archive/unarchive.
 * Archive is blocked while any sport default still points here.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { parsePopulationIdParam } from "@/lib/norms/leaderboard-zones";
import {
  assertCanArchivePopulation,
  parsePopulationPatchBody,
} from "@/lib/norms/editor";

function isDuplicateNameError(err: unknown): boolean {
  const e = err as Error & { code?: string };
  const msg = String(e?.message ?? "").toLowerCase();
  return e?.code === "23505" || msg.includes("unique") || msg.includes("duplicate");
}

type PopulationRow = {
  id: string;
  name: string;
  notes: string | null;
  archived_at: string | Date | null;
  created_at: string | Date;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const idParsed = parsePopulationIdParam(rawId);
  if (!idParsed.ok || idParsed.populationId == null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const id = idParsed.populationId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parsePopulationPatchBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const existingResult = await sql`
      SELECT id, name, notes, archived_at, created_at
      FROM norm_populations
      WHERE id = ${id}
      LIMIT 1
    `;
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }
    const existing = existingResult.rows[0] as PopulationRow;

    if (parsed.value.archived === true && existing.archived_at == null) {
      const countResult = await sql`
        SELECT COUNT(*)::int AS n
        FROM norm_sport_defaults
        WHERE population_id = ${id}
      `;
      const n = Number((countResult.rows[0] as { n?: number | string } | undefined)?.n ?? 0);
      const allowed = assertCanArchivePopulation(n);
      if (!allowed.ok) {
        return NextResponse.json({ error: allowed.error }, { status: allowed.status });
      }
    }

    const name = parsed.value.name ?? existing.name;
    const notes = parsed.value.notes !== undefined ? parsed.value.notes : existing.notes;
    let archivedAt: string | Date | null = existing.archived_at;
    if (parsed.value.archived === true) {
      archivedAt = existing.archived_at ?? new Date().toISOString();
    } else if (parsed.value.archived === false) {
      archivedAt = null;
    }

    const { rows } = await sql`
      UPDATE norm_populations
      SET name = ${name}, notes = ${notes}, archived_at = ${archivedAt}
      WHERE id = ${id}
      RETURNING id, name, notes, archived_at, created_at
    `;
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    if (isDuplicateNameError(err)) {
      return NextResponse.json(
        { error: "A population with that name already exists" },
        { status: 400 }
      );
    }
    console.error("PATCH /api/norms/populations/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update population" },
      { status: 500 }
    );
  }
}
