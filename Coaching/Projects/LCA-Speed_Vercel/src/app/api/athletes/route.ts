/**
 * Athletes API - GET (public), POST (auth required).
 * Smoke test endpoint for Phase 1.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Support ?active=true filter for team overview
    const { searchParams } = new URL(request.url);
    const activeFilter = searchParams.get('active');
    
    try {
      let query;
      if (activeFilter === 'true') {
        query = sql`
          SELECT id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
          FROM athletes
          WHERE active = true
          ORDER BY last_name, first_name
        `;
      } else {
        query = sql`
          SELECT id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
          FROM athletes
          ORDER BY last_name, first_name
        `;
      }
      const { rows } = await query;
      return NextResponse.json({ data: rows });
    } catch (legacyErr) {
      const msg = String((legacyErr as Error)?.message ?? "");
      if (
        msg.includes("athlete_type") ||
        msg.includes("active") ||
        msg.includes("column") ||
        msg.includes("does not exist")
      ) {
        try {
          const { rows } = await sql`
            SELECT id, first_name, last_name, gender, graduating_class, athlete_type, created_at
            FROM athletes
            ORDER BY last_name, first_name
          `;
          const withActive = (rows as Record<string, unknown>[]).map((r) => ({
            ...r,
            active: true,
          }));
          return NextResponse.json({ data: withActive });
        } catch (noActiveErr) {
          const innerMsg = String((noActiveErr as Error)?.message ?? "");
          if (
            innerMsg.includes("athlete_type") ||
            innerMsg.includes("column") ||
            innerMsg.includes("does not exist")
          ) {
            const { rows } = await sql`
              SELECT id, first_name, last_name, gender, graduating_class, created_at
              FROM athletes
              ORDER BY last_name, first_name
            `;
            const withDefaults = (rows as Record<string, unknown>[]).map((r) => ({
              ...r,
              athlete_type: "athlete",
              active: true,
            }));
            return NextResponse.json({ data: withDefaults });
          }
          throw noActiveErr;
        }
      }
      throw legacyErr;
    }
  } catch (err) {
    console.error("GET /api/athletes:", err);
    return NextResponse.json(
      { error: "Failed to fetch athletes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { first_name, last_name, gender, graduating_class, athlete_type } = body;
    const type = athlete_type ?? "athlete";

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

    const gradClass =
      type === "athlete" ? Number(graduating_class) : null;

    try {
      const { rows } = await sql`
        INSERT INTO athletes (first_name, last_name, gender, graduating_class, athlete_type, active)
        VALUES (${first_name}, ${last_name}, ${gender}, ${gradClass}, ${type}, true)
        RETURNING id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
      `;
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (insertErr) {
      const msg = String((insertErr as Error)?.message ?? "");
      if (
        (msg.includes("athlete_type") || msg.includes("active") || msg.includes("column") || msg.includes("does not exist")) &&
        type === "athlete" &&
        gradClass != null
      ) {
        const { rows } = await sql`
          INSERT INTO athletes (first_name, last_name, gender, graduating_class)
          VALUES (${first_name}, ${last_name}, ${gender}, ${gradClass})
          RETURNING id, first_name, last_name, gender, graduating_class, created_at
        `;
        const row = { ...(rows[0] as Record<string, unknown>), athlete_type: "athlete", active: true };
        return NextResponse.json({ data: row }, { status: 201 });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error("POST /api/athletes:", err);
    return NextResponse.json(
      { error: "Failed to create athlete" },
      { status: 500 }
    );
  }
}
