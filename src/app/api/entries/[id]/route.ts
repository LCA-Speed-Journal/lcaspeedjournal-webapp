/**
 * Entries API - PATCH (raw re-parse or override), DELETE (auth required).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, withTransaction } from "@/lib/db";
import { parseEntry, getMetricsRegistry } from "@/lib/parser";
import { defaultDistanceUnit, readMeasuredUnit } from "@/lib/distance-units";
import { decideSpeedRunRawPatch } from "@/lib/speed/raw-run";
import { rowsForSpeedRun } from "@/lib/speed/save-rows";

type EntryRow = {
  id: string;
  session_id: string;
  athlete_id: string;
  metric_key: string;
  interval_index: number | null;
  component: string | null;
  raw_input: string;
  context_hugo_group: string | null;
  measured_unit?: string | null;
};

function isMissingMeasuredUnitColumn(err: unknown): boolean {
  const codes: string[] = [];
  const messages: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const rec = current as { code?: string; message?: string; cause?: unknown };
    if (typeof rec.code === "string") codes.push(rec.code);
    if (typeof rec.message === "string") messages.push(rec.message);
    current = rec.cause;
  }
  return codes.includes("42703") && messages.join(" ").toLowerCase().includes("measured_unit");
}

async function loadEntryForReparse(id: string): Promise<EntryRow | null> {
  try {
    const { rows } = await sql`
      SELECT id, session_id, athlete_id, metric_key, interval_index, component,
             raw_input, context_hugo_group, measured_unit
      FROM entries
      WHERE id = ${id}
      LIMIT 1
    `;
    return (rows[0] as EntryRow | undefined) ?? null;
  } catch (err) {
    if (!isMissingMeasuredUnitColumn(err)) throw err;
    const { rows } = await sql`
      SELECT id, session_id, athlete_id, metric_key, interval_index, component,
             raw_input, context_hugo_group
      FROM entries
      WHERE id = ${id}
      LIMIT 1
    `;
    return (rows[0] as EntryRow | undefined) ?? null;
  }
}

type SessionRow = {
  day_splits: Record<string, number[]> | null;
  day_components: Record<string, string[]> | null;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await getServerSession(authOptions);
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { display_value, units, raw_input } = body;

    // Path A: Override (display_value and/or units)
    if (display_value !== undefined || units !== undefined) {
      let displayNum: number | undefined;
      if (display_value !== undefined) {
        displayNum = Number(display_value);
        if (Number.isNaN(displayNum)) {
          return NextResponse.json(
            { error: "display_value must be a number" },
            { status: 400 }
          );
        }
      }
      const unitsStr = units !== undefined ? String(units) : undefined;
      const { rows: currentRows } = await sql`
        SELECT value, display_value, units, metric_key FROM entries WHERE id = ${id} LIMIT 1
      `;
      if (!currentRows.length) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }
      const cur = currentRows[0] as {
        value: number;
        display_value: number;
        units: string;
        metric_key: string;
      };
      const newValue = displayNum ?? cur.value;
      const newDisplayValue = displayNum ?? cur.display_value;
      let newUnits = unitsStr ?? cur.units;
      const metric = getMetricsRegistry()[cur.metric_key];
      if (
        metric &&
        defaultDistanceUnit(metric.input_units) != null &&
        unitsStr != null &&
        unitsStr !== metric.display_units
      ) {
        newUnits = cur.units;
      }
      const { rows } = await sql`
        UPDATE entries
        SET value = ${newValue}, display_value = ${newDisplayValue}, units = ${newUnits}
        WHERE id = ${id}
        RETURNING id, session_id, athlete_id, metric_key, interval_index, component, value, display_value, units, raw_input, created_at
      `;
      if (!rows.length) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }

    // Path B: Raw re-parse
    if (raw_input != null && String(raw_input).trim() !== "") {
      const rawInputStr = String(raw_input).trim();
      const entry = await loadEntryForReparse(id);
      if (!entry) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }

      const patchDecision = decideSpeedRunRawPatch(
        entry.raw_input,
        entry.metric_key,
        rawInputStr
      );

      if (patchDecision.kind === "error") {
        return NextResponse.json(
          { error: patchDecision.message },
          { status: 400 }
        );
      }

      if (patchDecision.kind === "rebuild") {
        const speedInput = patchDecision.input;
        let windowRows;
        try {
          windowRows = rowsForSpeedRun(speedInput);
        } catch (err) {
          const msg = (err as Error)?.message ?? "Invalid speed run";
          return NextResponse.json({ error: msg }, { status: 400 });
        }

        const originalRawInput = entry.raw_input.trim();
        const contextHugoGroup = entry.context_hugo_group;
        const newRawInput = JSON.stringify(speedInput);

        const count = await withTransaction(async (tx) => {
          await tx`
            DELETE FROM entries
            WHERE session_id = ${entry.session_id}
              AND athlete_id = ${entry.athlete_id}
              AND raw_input = ${originalRawInput}
          `;
          for (const row of windowRows) {
            await tx`
              INSERT INTO entries (
                session_id, athlete_id, metric_key,
                interval_index, component,
                value, display_value, units, raw_input,
                context_hugo_group,
                distance_unit, start_distance, end_distance,
                legacy_metric_key, legacy_component
              )
              VALUES (
                ${entry.session_id},
                ${entry.athlete_id},
                ${row.metric_key},
                ${row.interval_index},
                ${row.component},
                ${row.value},
                ${row.display_value},
                ${row.units},
                ${newRawInput},
                ${contextHugoGroup},
                ${row.distance_unit},
                ${row.start_distance},
                ${row.end_distance},
                ${row.legacy_metric_key},
                ${row.legacy_component}
              )
            `;
          }
          return windowRows.length;
        });

        return NextResponse.json({ data: { count } });
      }

      const registry = getMetricsRegistry();
      if (!registry[entry.metric_key]) {
        return NextResponse.json(
          { error: `Unknown metric: ${entry.metric_key}` },
          { status: 400 }
        );
      }

      const { rows: sessionRows } = await sql`
        SELECT day_splits, day_components
        FROM sessions
        WHERE id = ${entry.session_id}
        LIMIT 1
      `;
      if (!sessionRows.length) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
      const sess = sessionRows[0] as SessionRow;
      const sessionOverrides =
        sess?.day_splits || sess?.day_components
          ? { day_splits: sess.day_splits ?? undefined, day_components: sess.day_components ?? undefined }
          : undefined;

      const measuredUnitProvided = Object.prototype.hasOwnProperty.call(body, "measured_unit");
      let measuredUnit = readMeasuredUnit(body.measured_unit);
      if (measuredUnitProvided && measuredUnit == null) {
        return NextResponse.json(
          { error: "measured_unit must be ft_in, in, cm, or m" },
          { status: 400 }
        );
      }
      if (!measuredUnitProvided) {
        measuredUnit = readMeasuredUnit(entry.measured_unit);
      }

      const parsed = parseEntry(
        entry.metric_key,
        rawInputStr,
        sessionOverrides,
        measuredUnit ? { measuredUnit } : undefined
      );
      const entryInterval = entry.interval_index;
      const entryComponent = entry.component ?? null;
      const match =
        parsed.find(
          (p) =>
            (p.interval_index === entryInterval || (p.interval_index == null && entryInterval == null)) &&
            (p.component ?? null) === entryComponent
        ) ?? parsed[0];
      if (!match) {
        return NextResponse.json(
          { error: "Parsed result did not match entry" },
          { status: 400 }
        );
      }

      const updateParsed = (withMeasuredUnit: boolean) => {
        if (withMeasuredUnit) {
          return sql`
            UPDATE entries
            SET value = ${match.value}, display_value = ${match.display_value}, units = ${match.units}, raw_input = ${rawInputStr},
                measured_unit = ${measuredUnit}
            WHERE id = ${id}
            RETURNING id, session_id, athlete_id, metric_key, interval_index, component, value, display_value, units, raw_input, created_at
          `;
        }
        return sql`
          UPDATE entries
          SET value = ${match.value}, display_value = ${match.display_value}, units = ${match.units}, raw_input = ${rawInputStr}
          WHERE id = ${id}
          RETURNING id, session_id, athlete_id, metric_key, interval_index, component, value, display_value, units, raw_input, created_at
        `;
      };
      let rows;
      try {
        ({ rows } = await updateParsed(measuredUnitProvided));
      } catch (updateErr) {
        if (!(measuredUnitProvided && isMissingMeasuredUnitColumn(updateErr))) throw updateErr;
        ({ rows } = await updateParsed(false));
      }
      if (!rows.length) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }

    return NextResponse.json(
      { error: "Provide display_value/units (override) or raw_input (re-parse)" },
      { status: 400 }
    );
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (
      msg.includes("Cannot parse") ||
      msg.includes("does not match") ||
      msg.includes("Unknown metric")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("PATCH /api/entries/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await getServerSession(authOptions);
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { rows } = await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`;
    if (!rows.length) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/entries/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
