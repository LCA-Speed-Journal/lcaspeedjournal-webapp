/**
 * Entries API - PATCH (raw re-parse or override), DELETE (auth required).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseEntry, getMetricsRegistry } from "@/lib/parser";

type EntryRow = {
  id: string;
  session_id: string;
  metric_key: string;
  interval_index: number | null;
  component: string | null;
};

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
        SELECT value, display_value, units FROM entries WHERE id = ${id} LIMIT 1
      `;
      if (!currentRows.length) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }
      const cur = currentRows[0] as { value: number; display_value: number; units: string };
      const newValue = displayNum ?? cur.value;
      const newDisplayValue = displayNum ?? cur.display_value;
      const newUnits = unitsStr ?? cur.units;
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
      const { rows: entryRows } = await sql`
        SELECT id, session_id, metric_key, interval_index, component
        FROM entries
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!entryRows.length) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }
      const entry = entryRows[0] as EntryRow;

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

      const parsed = parseEntry(entry.metric_key, rawInputStr, sessionOverrides);
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

      const { rows } = await sql`
        UPDATE entries
        SET value = ${match.value}, display_value = ${match.display_value}, units = ${match.units}, raw_input = ${rawInputStr}
        WHERE id = ${id}
        RETURNING id, session_id, athlete_id, metric_key, interval_index, component, value, display_value, units, raw_input, created_at
      `;
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
