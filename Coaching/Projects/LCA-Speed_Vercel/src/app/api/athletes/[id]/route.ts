/**
 * Athletes API - single athlete: GET (public), PUT (auth), DELETE (auth).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    let row: Record<string, unknown>;
    try {
      const { rows } = await sql`
        SELECT id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
        FROM athletes
        WHERE id = ${id}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
      }
      row = rows[0] as Record<string, unknown>;
    } catch (legacyErr) {
      const msg = String((legacyErr as Error)?.message ?? "");
      if (
        msg.includes("athlete_type") ||
        msg.includes("active") ||
        msg.includes("column") ||
        msg.includes("does not exist")
      ) {
        const { rows } = await sql`
          SELECT id, first_name, last_name, gender, graduating_class, created_at
          FROM athletes
          WHERE id = ${id}
          LIMIT 1
        `;
        if (rows.length === 0) {
          return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
        }
        row = { ...(rows[0] as Record<string, unknown>), athlete_type: "athlete", active: true };
      } else {
        throw legacyErr;
      }
    }
    return NextResponse.json({ data: row });
  } catch (err) {
    console.error("GET /api/athletes/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch athlete" },
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

  const { id } = await params;
  try {
    const body = await request.json();
    const { first_name, last_name, gender, graduating_class, athlete_type, active } = body;
    const type = athlete_type ?? "athlete";
    const isActive = active !== undefined ? Boolean(active) : true;

    if (!first_name || !last_name || !gender) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name, gender" },
        { status: 400 }
      );
    }

    if (type === "athlete" && (graduating_class == null || graduating_class === "")) {
      return NextResponse.json(
        { error: "Athletes require graduating_class" },
        { status: 400 }
      );
    }

    const gradClass = type === "athlete" ? Number(graduating_class) : null;

    try {
      const { rows } = await sql`
        UPDATE athletes
        SET first_name = ${first_name}, last_name = ${last_name},
            gender = ${gender}, graduating_class = ${gradClass}, athlete_type = ${type}, active = ${isActive}
        WHERE id = ${id}
        RETURNING id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    } catch (updateErr) {
      const msg = String((updateErr as Error)?.message ?? "");
      const isActiveColumnMissing =
        msg.includes("active") && (msg.includes("column") || msg.includes("does not exist"));
      if (isActiveColumnMissing) {
        try {
          await sql`
            ALTER TABLE athletes ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true
          `;
          const { rows } = await sql`
            UPDATE athletes
            SET first_name = ${first_name}, last_name = ${last_name},
                gender = ${gender}, graduating_class = ${gradClass}, athlete_type = ${type}, active = ${isActive}
            WHERE id = ${id}
            RETURNING id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
          `;
          if (rows.length === 0) {
            return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
          }
          return NextResponse.json({ data: rows[0] });
        } catch (alterOrRetryErr) {
          console.error("PUT /api/athletes/[id]: add active column and retry failed:", alterOrRetryErr);
          return NextResponse.json(
            { error: "Failed to update athlete. Run scripts/migrate-phase-a-dashboard.sql to add the active column." },
            { status: 500 }
          );
        }
      }
      const isOtherColumnError =
        msg.includes("athlete_type") ||
        msg.includes("column") ||
        msg.includes("does not exist");
      if (isOtherColumnError) {
        try {
          const { rows } = await sql`
            UPDATE athletes
            SET first_name = ${first_name}, last_name = ${last_name},
                gender = ${gender}, graduating_class = ${gradClass}, athlete_type = ${type}
            WHERE id = ${id}
            RETURNING id, first_name, last_name, gender, graduating_class, athlete_type, created_at
          `;
          if (rows.length === 0) {
            return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
          }
          const activeValue = active !== undefined ? Boolean(active) : true;
          const row = { ...(rows[0] as Record<string, unknown>), active: activeValue };
          return NextResponse.json({ data: row });
        } catch (fallbackErr) {
          const fallbackMsg = String((fallbackErr as Error)?.message ?? "");
          if (fallbackMsg.includes("athlete_type") || fallbackMsg.includes("column")) {
            const { rows } = await sql`
              UPDATE athletes
              SET first_name = ${first_name}, last_name = ${last_name},
                  gender = ${gender}, graduating_class = ${gradClass}
              WHERE id = ${id}
              RETURNING id, first_name, last_name, gender, graduating_class, created_at
            `;
            if (rows.length === 0) {
              return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
            }
            const activeValue = active !== undefined ? Boolean(active) : true;
            const row = { ...(rows[0] as Record<string, unknown>), athlete_type: type, active: activeValue };
            return NextResponse.json({ data: row });
          }
          throw fallbackErr;
        }
      }
      throw updateErr;
    }
  } catch (err) {
    console.error("PUT /api/athletes/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update athlete" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const { rows } = await sql`
      DELETE FROM athletes WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error("DELETE /api/athletes/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete athlete" },
      { status: 500 }
    );
  }
}
