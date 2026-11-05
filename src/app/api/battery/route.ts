/**
 * Testing battery API - POST creates a boys basketball baseline (coach only).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";
import { BOYS_BASKETBALL_BASELINE } from "@/lib/battery/template";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
}

async function insertBattery(
  template: typeof BOYS_BASKETBALL_BASELINE,
  comparisonId: string | null
) {
  const run = (sessionId: string | null) => sql`
    INSERT INTO testing_batteries (
      title, hugo_group, grouping_mode, cutoff_n, senior_grad_year, comparison_session_id
    )
    VALUES (
      ${template.title},
      ${template.hugo_group},
      ${template.grouping_mode},
      ${template.cutoff_n},
      ${template.senior_grad_year},
      ${sessionId}
    )
    RETURNING id
  `;
  try {
    return await run(comparisonId);
  } catch (err) {
    if (comparisonId != null && readPgError(err).codes.includes("23503")) {
      return run(null);
    }
    throw err;
  }
}

async function comparisonSessionId(
  sessionDate: string,
  hugoGroup: string
): Promise<string | null> {
  const pickGrouped = async (includeLegacy: boolean) => {
    if (includeLegacy) {
      const { rows } = await sql`
        SELECT s.id
        FROM sessions s
        INNER JOIN entries e ON e.session_id = s.id
        WHERE s.session_date = ${sessionDate}::date
          AND e.context_hugo_group = ${hugoGroup}
          AND (
            e.metric_key = ${"40yd_Dash"}
            OR e.legacy_metric_key = ${"40yd_Dash"}
          )
        GROUP BY s.id
        ORDER BY COUNT(*) DESC, s.id ASC
        LIMIT 1
      `;
      const id = (rows[0] as { id: string } | undefined)?.id;
      return id == null ? null : String(id);
    }
    const { rows } = await sql`
      SELECT s.id
      FROM sessions s
      INNER JOIN entries e ON e.session_id = s.id
      WHERE s.session_date = ${sessionDate}::date
        AND e.context_hugo_group = ${hugoGroup}
        AND e.metric_key = ${"40yd_Dash"}
      GROUP BY s.id
      ORDER BY COUNT(*) DESC, s.id ASC
      LIMIT 1
    `;
    const id = (rows[0] as { id: string } | undefined)?.id;
    return id == null ? null : String(id);
  };

  try {
    return await pickGrouped(true);
  } catch (err) {
    const { codes, message } = readPgError(err);
    if (!codes.includes("42703")) throw err;
    const msg = message.toLowerCase();
    if (msg.includes("context_hugo_group")) return dateOnlyComparisonSessionId(sessionDate);
    if (msg.includes("legacy_metric_key")) return pickGrouped(false);
    throw err;
  }
}

async function dateOnlyComparisonSessionId(sessionDate: string): Promise<string | null> {
  const pick = async (includeLegacy: boolean) => {
    if (includeLegacy) {
      const { rows } = await sql`
        SELECT s.id
        FROM sessions s
        INNER JOIN entries e ON e.session_id = s.id
        WHERE s.session_date = ${sessionDate}::date
          AND (
            e.metric_key = ${"40yd_Dash"}
            OR e.legacy_metric_key = ${"40yd_Dash"}
          )
        GROUP BY s.id
        ORDER BY COUNT(*) DESC, s.id ASC
        LIMIT 1
      `;
      const id = (rows[0] as { id: string } | undefined)?.id;
      return id == null ? null : String(id);
    }
    const { rows } = await sql`
      SELECT s.id
      FROM sessions s
      INNER JOIN entries e ON e.session_id = s.id
      WHERE s.session_date = ${sessionDate}::date
        AND e.metric_key = ${"40yd_Dash"}
      GROUP BY s.id
      ORDER BY COUNT(*) DESC, s.id ASC
      LIMIT 1
    `;
    const id = (rows[0] as { id: string } | undefined)?.id;
    return id == null ? null : String(id);
  };

  try {
    return await pick(true);
  } catch (err) {
    const { codes, message } = readPgError(err);
    if (!codes.includes("42703") || !message.toLowerCase().includes("legacy_metric_key")) throw err;
    return pick(false);
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body?.template !== "boys_basketball_baseline") {
      return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    }

    const template = BOYS_BASKETBALL_BASELINE;
    const comparisonId = await comparisonSessionId(
      template.comparison_date,
      template.comparison_hugo_group
    );
    const inserted = await insertBattery(template, comparisonId);
    const id = (inserted.rows[0] as { id: string } | undefined)?.id;
    if (!id) {
      return NextResponse.json({ error: "Failed to create battery" }, { status: 500 });
    }

    await Promise.all(
      template.days.map(
        (day) => sql`
          INSERT INTO testing_battery_days (
            battery_id, day_key, label, session_date, sort_order, rest_seconds
          )
          VALUES (
            ${id},
            ${day.day_key},
            ${day.label},
            ${day.session_date},
            ${day.sort_order},
            ${day.rest_seconds}
          )
        `
      )
    );

    return NextResponse.json({ data: { id: String(id) } }, { status: 201 });
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    console.error("POST /api/battery:", err);
    return NextResponse.json({ error: "Failed to create battery" }, { status: 500 });
  }
}
