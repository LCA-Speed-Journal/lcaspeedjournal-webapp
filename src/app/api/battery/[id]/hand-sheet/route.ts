/**
 * Bib hand sheet PDF. Coach only. Read-only.
 * Printing does not assign or replace bibs. Assign them with POST /bibs first.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";
import {
  handSheetFilename,
  renderHandSheet,
  type HandSheetAthlete,
} from "@/lib/battery/hand-sheet";

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
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

function finiteInt(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function sheetFrom(rows: unknown[]): HandSheetAthlete[] {
  return rows.flatMap((row) => {
    const rec = row as {
      bib?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      grade_digit?: unknown;
    };
    if (rec.bib == null) return [];
    return [
      {
        bib: asText(rec.bib),
        first_name: asText(rec.first_name),
        last_name: asText(rec.last_name),
        grade_digit: finiteInt(rec.grade_digit) ?? 0,
      },
    ];
  });
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
      sql`SELECT id FROM testing_batteries WHERE id = ${id} LIMIT 1`,
      sql`
        SELECT b.bib, a.first_name, a.last_name, b.grade_digit
        FROM testing_battery_bibs b
        INNER JOIN athletes a ON a.id = b.athlete_id
        WHERE b.battery_id = ${id}
        ORDER BY b.grade_digit ASC, b.alpha_index ASC, b.bib ASC
      `,
    ]);
    if (!batteryResult.rows.length) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    const athletes = sheetFrom(sheetResult.rows);
    if (athletes.length === 0) {
      return NextResponse.json(
        { error: "Assign bibs before printing the hand sheet." },
        { status: 409 }
      );
    }
    const buffer = await renderHandSheet(athletes);
    return pdfResponse(buffer, handSheetFilename());
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("GET /api/battery/[id]/hand-sheet:", err);
    return NextResponse.json({ error: "Failed to build hand sheet" }, { status: 500 });
  }
}
