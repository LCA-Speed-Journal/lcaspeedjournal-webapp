import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { parseRosterPaste } from "@/lib/weight-room/parse-roster-paste";

type ExactMatch = { id: string; first_name: string; last_name: string };

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
    if (typeof rec.text !== "string") {
      return NextResponse.json(
        { error: "text is required and must be a string" },
        { status: 400 }
      );
    }

    const parsed = parseRosterPaste(rec.text);
    const { rows: athletes } = await sql`
      SELECT id, first_name, last_name, lower(first_name) AS first_l, lower(last_name) AS last_l
      FROM athletes
      WHERE active = true
    `;
    const active = athletes as Array<
      ExactMatch & { first_l: string; last_l: string }
    >;

    const rows = parsed.map((line) => {
      if (line.error) {
        return {
          raw: line.raw,
          first_name: line.first_name,
          last_name: line.last_name,
          error: line.error,
          exact_matches: [] as ExactMatch[],
        };
      }
      const first = line.first_name.toLowerCase();
      const last = line.last_name.toLowerCase();
      const exact_matches = active
        .filter((a) => a.first_l === first && a.last_l === last)
        .map(({ id, first_name, last_name }) => ({
          id,
          first_name,
          last_name,
        }));
      return {
        raw: line.raw,
        first_name: line.first_name,
        last_name: line.last_name,
        exact_matches,
      };
    });

    return NextResponse.json({ data: { rows } });
  } catch (err) {
    console.error("POST /api/weight-room/rosters/preview:", err);
    return NextResponse.json(
      { error: "Failed to preview roster" },
      { status: 500 }
    );
  }
}
