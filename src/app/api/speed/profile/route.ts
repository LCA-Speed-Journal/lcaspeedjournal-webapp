/**
 * Build-in velocity profile.
 * GET ?athlete_id= returns that athlete's BuildIn rows.
 * GET ?hugo_group= returns BuildIn rows for athletes in that group.
 * Missing speed-window columns (Postgres 42703) return an empty list until the migration runs.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { BUILD_IN_KEY, type DistanceUnit } from "@/lib/speed/windows";

type ProfileRow = {
  start_distance: number;
  end_distance: number;
  distance_unit: DistanceUnit;
  display_value: number;
  athlete_id: string;
};

function isUndefinedColumn(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const rec = current as { code?: string; cause?: unknown };
    if (rec.code === "42703") return true;
    current = rec.cause;
  }
  return false;
}

function toProfileRows(rows: Record<string, unknown>[]): ProfileRow[] {
  const out: ProfileRow[] = [];
  for (const row of rows) {
    const unit = row.distance_unit;
    if (unit !== "m" && unit !== "yd") continue;
    if (row.start_distance == null || row.end_distance == null || row.display_value == null) {
      continue;
    }
    const start = Number(row.start_distance);
    const end = Number(row.end_distance);
    const mph = Number(row.display_value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(mph)) continue;
    out.push({
      start_distance: start,
      end_distance: end,
      distance_unit: unit,
      display_value: mph,
      athlete_id: String(row.athlete_id),
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const athleteId = searchParams.get("athlete_id")?.trim() ?? "";
  const hugoGroup = searchParams.get("hugo_group")?.trim() ?? "";

  if (!athleteId && !hugoGroup) {
    return NextResponse.json(
      { error: "athlete_id or hugo_group is required" },
      { status: 400 }
    );
  }
  if (athleteId && hugoGroup) {
    return NextResponse.json(
      { error: "Provide athlete_id or hugo_group, not both" },
      { status: 400 }
    );
  }

  try {
    const result = athleteId
      ? await sql`
          SELECT start_distance, end_distance, distance_unit, display_value, athlete_id
          FROM entries
          WHERE metric_key = ${BUILD_IN_KEY}
            AND athlete_id = ${athleteId}
        `
      : await sql`
          SELECT e.start_distance, e.end_distance, e.distance_unit, e.display_value, e.athlete_id
          FROM entries e
          INNER JOIN athlete_hugo_memberships m ON m.athlete_id = e.athlete_id
          WHERE e.metric_key = ${BUILD_IN_KEY}
            AND m.hugo_group = ${hugoGroup}
        `;
    return NextResponse.json({
      data: toProfileRows(result.rows as Record<string, unknown>[]),
    });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return NextResponse.json({ data: [] });
    }
    console.error("GET /api/speed/profile:", err);
    return NextResponse.json(
      { error: "Failed to load build-in profile" },
      { status: 500 }
    );
  }
}
