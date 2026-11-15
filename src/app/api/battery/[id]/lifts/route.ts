/**
 * Save a testing-day bench or hex max as a weight-room set.
 * Coach only. A second save for the same athlete, movement, and date replaces the load.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, withTransaction } from "@/lib/db";
import { athleteOnRoster } from "@/lib/battery/group-store";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";
import { testingLiftMovement } from "@/lib/battery/testing-lifts";
import { BOYS_BASKETBALL_BASELINE } from "@/lib/battery/template";
import { isUuid, serializeDate } from "@/lib/weight-room/insert-template";
import { isHugoGroup } from "@/lib/weight-room/constants";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";
const MAX_LOAD_LB = 1500;

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
}

function calendarDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const text = serializeDate(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dayKeyForMovement(movementKey: string): string | null {
  const day = BOYS_BASKETBALL_BASELINE.days.find((item) =>
    (item.metric_keys as readonly string[]).includes(movementKey)
  );
  return day?.day_key ?? null;
}

function parseLoad(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw <= 0 || raw > MAX_LOAD_LB) return null;
  return raw;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;

  const movementKey = typeof rec.movement === "string" ? rec.movement.trim() : "";
  const movementName = testingLiftMovement(movementKey);
  if (!movementName) {
    return NextResponse.json({ error: "Unknown movement" }, { status: 400 });
  }
  if (!isUuid(rec.athlete_id)) {
    return NextResponse.json({ error: "athlete_id must be a UUID" }, { status: 400 });
  }
  const athleteId = rec.athlete_id.trim();
  const load = parseLoad(rec.load);
  if (load == null) {
    return NextResponse.json(
      { error: "Load must be a number greater than 0 and at most 1500" },
      { status: 400 }
    );
  }

  const dayKey = dayKeyForMovement(movementKey);
  if (!dayKey) {
    return NextResponse.json({ error: "Unknown movement" }, { status: 400 });
  }

  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const [batteryResult, athleteResult] = await Promise.all([
      sql`
        SELECT
          b.hugo_group,
          d.day_key,
          d.session_date,
          s.session_date AS linked_session_date
        FROM testing_batteries b
        LEFT JOIN testing_battery_days d
          ON d.battery_id = b.id AND d.day_key = ${dayKey}
        LEFT JOIN sessions s ON s.id = d.session_id
        WHERE b.id = ${id}
        LIMIT 1
      `,
      sql`SELECT id FROM athletes WHERE id = ${athleteId} LIMIT 1`,
    ]);
    if (!batteryResult.rows.length) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (!athleteResult.rows.length) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 400 });
    }

    const battery = batteryResult.rows[0] as {
      hugo_group: unknown;
      day_key: unknown;
      session_date: unknown;
      linked_session_date: unknown;
    };
    if (battery.day_key == null) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const sessionDate =
      calendarDate(battery.session_date) ?? calendarDate(battery.linked_session_date);
    if (!sessionDate) {
      return NextResponse.json({ error: "Testing day has no date" }, { status: 400 });
    }
    if (!isHugoGroup(battery.hugo_group)) {
      return NextResponse.json(
        { error: "Battery group is not a weight-room group" },
        { status: 400 }
      );
    }
    const hugoGroup = battery.hugo_group;
    const title = `${movementName} ${sessionDate}`;
    if (!(await athleteOnRoster(athleteId, hugoGroup))) {
      return NextResponse.json({ error: "Athlete is not on this roster" }, { status: 400 });
    }

    const saved = await withTransaction(async (tx) => {
      const locked = await tx`
        SELECT id FROM testing_batteries WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.rows.length) return { ok: false as const };

      const { rows: existing } = await tx`
        SELECT t.id AS template_id, m.id AS movement_id
        FROM workout_templates t
        INNER JOIN workout_movements m
          ON m.template_id = t.id AND m.name = ${movementName}
        WHERE t.hugo_group = ${hugoGroup}
          AND t.session_date = ${sessionDate}::date
          AND (
            (SELECT COUNT(*) FROM workout_movements c WHERE c.template_id = t.id) = 1
            OR t.title = ${title}
          )
        ORDER BY (
          EXISTS (
            SELECT 1
            FROM session_logs l
            WHERE l.template_id = t.id AND l.athlete_id = ${athleteId}
          )
        ) DESC, t.created_at ASC, m.sort_index ASC
        LIMIT 1
      `;

      let templateId: string;
      let movementId: string;
      const found = existing[0] as { template_id?: unknown; movement_id?: unknown } | undefined;
      if (found?.template_id != null && found.movement_id != null) {
        templateId = String(found.template_id);
        movementId = String(found.movement_id);
      } else {
        templateId = crypto.randomUUID();
        movementId = crypto.randomUUID();
        const targetsJson = JSON.stringify(["1"]);
        await tx`
          INSERT INTO workout_templates (
            id, hugo_group, week_number, day_name, session_date, focus, title
          )
          VALUES (
            ${templateId},
            ${hugoGroup},
            ${null},
            ${""},
            ${sessionDate},
            ${"Testing"},
            ${title}
          )
        `;
        await tx`
          INSERT INTO workout_movements (
            id, template_id, sort_index, label, name, block, set_count, targets, notes, from_pair, speed_journal_metric_key, speed_journal_component
          )
          VALUES (
            ${movementId},
            ${templateId},
            ${0},
            ${""},
            ${movementName},
            ${"Main"},
            ${1},
            ${targetsJson},
            ${""},
            ${false},
            ${null},
            ${null}
          )
        `;
      }

      const { rows: logRows } = await tx`
        INSERT INTO session_logs (
          id, athlete_id, template_id, scan_id, session_date, hugo_group
        )
        VALUES (
          ${crypto.randomUUID()},
          ${athleteId},
          ${templateId},
          ${null},
          ${sessionDate},
          ${hugoGroup}
        )
        ON CONFLICT (athlete_id, template_id) DO UPDATE SET
          session_date = EXCLUDED.session_date,
          hugo_group = EXCLUDED.hugo_group,
          confirmed_at = NOW()
        RETURNING id
      `;
      const logId = String((logRows[0] as { id: unknown }).id);
      await tx`
        DELETE FROM set_results
        WHERE session_log_id = ${logId}
          AND movement_id = ${movementId}
      `;
      const resultId = crypto.randomUUID();
      await tx`
        INSERT INTO set_results (
          id, session_log_id, movement_id, set_index, raw_text, kind, load, reps, units, corrected
        )
        VALUES (
          ${resultId},
          ${logId},
          ${movementId},
          ${0},
          ${`${load} x 1`},
          ${"load_reps"},
          ${load},
          ${1},
          ${"lb"},
          ${false}
        )
      `;
      await tx`
        DELETE FROM set_results AS r
        USING session_logs AS l, workout_movements AS m
        WHERE r.session_log_id = l.id
          AND r.movement_id = m.id
          AND l.athlete_id = ${athleteId}
          AND l.hugo_group = ${hugoGroup}
          AND l.session_date = ${sessionDate}::date
          AND m.name = ${movementName}
          AND l.id <> ${logId}
      `;
      return { ok: true as const };
    });
    if (!saved.ok) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        athlete_id: athleteId,
        movement: movementKey,
        load,
        session_date: sessionDate,
      },
    });
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    const { codes } = readPgError(err);
    if (codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    if (codes.includes("23503")) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 400 });
    }
    console.error("POST /api/battery/[id]/lifts:", err);
    return NextResponse.json({ error: "Failed to save lift" }, { status: 500 });
  }
}
