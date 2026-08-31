/**
 * Coach GET/PUT for sport → population defaults.
 * PUT with population_id null deletes that (hugo_group, metric_key) row.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { parseSportDefaultPut } from "@/lib/norms/editor";

export async function GET() {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await sql`
      SELECT hugo_group, metric_key, population_id
      FROM norm_sport_defaults
      ORDER BY hugo_group ASC, metric_key ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/norms/defaults:", err);
    return NextResponse.json(
      { error: "Failed to fetch sport defaults" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSportDefaultPut(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { hugo_group, metric_key, population_id } = parsed.value;

  try {
    if (population_id == null) {
      await sql`
        DELETE FROM norm_sport_defaults
        WHERE hugo_group = ${hugo_group}
          AND metric_key = ${metric_key}
      `;
      return NextResponse.json({
        data: { hugo_group, metric_key, population_id: null },
      });
    }

    const popResult = await sql`
      SELECT id, archived_at
      FROM norm_populations
      WHERE id = ${population_id}
      LIMIT 1
    `;
    if (popResult.rows.length === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }
    const pop = popResult.rows[0] as { id: string; archived_at: string | Date | null };
    if (pop.archived_at != null) {
      return NextResponse.json(
        { error: "Cannot set a default to an archived population" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      INSERT INTO norm_sport_defaults (hugo_group, metric_key, population_id)
      VALUES (${hugo_group}, ${metric_key}, ${population_id})
      ON CONFLICT (hugo_group, metric_key)
      DO UPDATE SET population_id = EXCLUDED.population_id
      RETURNING hugo_group, metric_key, population_id
    `;
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    console.error("PUT /api/norms/defaults:", err);
    return NextResponse.json(
      { error: "Failed to save sport default" },
      { status: 500 }
    );
  }
}
