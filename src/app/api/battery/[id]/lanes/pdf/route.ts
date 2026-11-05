/**
 * Friday lane sheet PDF. Coach only. Does not write.
 * A missing freeze returns 409 so a download cannot reshuffle heats.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { orderBoard } from "@/lib/battery/board-order";
import { isBatterySchemaMissing, loadBatteryBoard, readPgError } from "@/lib/battery/load";
import { cutoffAfterHeat, parseLaneHeats } from "@/lib/battery/lanes";
import { laneSheetFilename, renderLaneSheet, type LaneSheetHeat } from "@/lib/battery/lane-sheet";

export const runtime = "nodejs";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
}

function pdfResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function asText(raw: unknown): string {
  return raw == null ? "" : String(raw);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const [batteryResult, sheetResult] = await Promise.all([
      sql`SELECT id, title FROM testing_batteries WHERE id = ${id} LIMIT 1`,
      sql`SELECT heats FROM testing_battery_lane_sheets WHERE battery_id = ${id} LIMIT 1`,
    ]);
    if (!batteryResult.rows.length) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (!sheetResult.rows.length) {
      return NextResponse.json(
        { error: "Freeze Friday lanes before printing." },
        { status: 409 }
      );
    }
    const stored = parseLaneHeats((sheetResult.rows[0] as { heats?: unknown }).heats);
    if (!stored) {
      return NextResponse.json({ error: "Stored lane sheet could not be read" }, { status: 500 });
    }

    const board = await loadBatteryBoard(id, {
      view: "meet",
      group: "overall",
      dayKeys: ["A", "B"],
    });
    if (!board) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }

    const athleteIds = [...new Set(stored.flatMap((heat) => heat.athlete_ids))];
    const names = new Map<string, { first_name: string; last_name: string; bib: string }>();
    if (athleteIds.length > 0) {
      const ids = athleteIds as unknown as string;
      const { rows } = await sql`
        SELECT a.id, a.first_name, a.last_name, b.bib
        FROM athletes a
        LEFT JOIN testing_battery_bibs b
          ON b.athlete_id = a.id AND b.battery_id = ${id}::uuid
        WHERE a.id = ANY(${ids}::uuid[])
      `;
      for (const row of rows as {
        id: unknown;
        first_name: unknown;
        last_name: unknown;
        bib: unknown;
      }[]) {
        names.set(String(row.id), {
          first_name: asText(row.first_name),
          last_name: asText(row.last_name),
          bib: asText(row.bib),
        });
      }
    }

    const placeById = new Map(
      orderBoard(board.athletes, board.untested_ids).map((row) => [
        row.athlete.athlete_id,
        row.place,
      ])
    );
    const ordered = stored.toSorted((a, b) => a.heat - b.heat);
    const lineAfter = cutoffAfterHeat(
      ordered.map((heat) => ({
        heat: heat.heat,
        places: heat.athlete_ids.map((athleteId) => placeById.get(athleteId) ?? null),
      }))
    );
    const heats: LaneSheetHeat[] = ordered.map((heat) => ({
      heat: heat.heat,
      cutoffAfter: lineAfter === heat.heat,
      lanes: heat.athlete_ids.map((athleteId, index) => {
        const athlete = names.get(athleteId);
        const name = athlete
          ? `${athlete.last_name}, ${athlete.first_name}`.replace(/^,\s*|,\s*$/g, "").trim()
          : "Athlete";
        return {
          lane: index + 1,
          bib: athlete?.bib ?? "",
          name: name || "Athlete",
          place: placeById.has(athleteId) ? (placeById.get(athleteId) ?? null) : null,
        };
      }),
    }));

    const title = asText((batteryResult.rows[0] as { title?: unknown }).title).trim();
    const buffer = await renderLaneSheet({
      title: title || "Boys Basketball Baseline",
      heats,
    });
    return pdfResponse(buffer, laneSheetFilename());
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("GET /api/battery/[id]/lanes/pdf:", err);
    return NextResponse.json({ error: "Failed to build lane sheet" }, { status: 500 });
  }
}
