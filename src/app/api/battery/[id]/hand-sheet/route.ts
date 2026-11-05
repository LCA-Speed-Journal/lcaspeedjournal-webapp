/**
 * Bib hand sheet PDF. Coach only.
 * An empty bib table is filled the same way as POST /bibs without issue.
 * Stored bibs are printed as they are. Download does not set bibs_issued_at.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTransaction, type DbSql } from "@/lib/db";
import { assignBibs, type BibAthlete } from "@/lib/battery/bibs";
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

function rosterFrom(rows: unknown[]): BibAthlete[] {
  const byId = new Map<string, BibAthlete>();
  for (const row of rows) {
    const rec = row as {
      athlete_id?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      graduating_class?: unknown;
    };
    if (rec.athlete_id == null) continue;
    const athleteId = String(rec.athlete_id);
    if (byId.has(athleteId)) continue;
    byId.set(athleteId, {
      athlete_id: athleteId,
      first_name: asText(rec.first_name),
      last_name: asText(rec.last_name),
      graduating_class: finiteInt(rec.graduating_class),
    });
  }
  return [...byId.values()];
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

async function readSheet(tx: DbSql, batteryId: string): Promise<HandSheetAthlete[]> {
  const result = await tx`
    SELECT b.bib, a.first_name, a.last_name, b.grade_digit
    FROM testing_battery_bibs b
    INNER JOIN athletes a ON a.id = b.athlete_id
    WHERE b.battery_id = ${batteryId}
    ORDER BY b.grade_digit ASC, b.alpha_index ASC, b.bib ASC
  `;
  return sheetFrom(result.rows);
}

async function insertBibRows(
  tx: DbSql,
  batteryId: string,
  rows: { athlete_id: string; bib: string; grade_digit: number; alpha_index: number }[]
) {
  if (rows.length === 0) return;
  const payload = JSON.stringify(rows);
  await tx`
    INSERT INTO testing_battery_bibs (
      battery_id, athlete_id, bib, grade_digit, alpha_index
    )
    SELECT
      ${batteryId}::uuid,
      x.athlete_id,
      x.bib,
      x.grade_digit,
      x.alpha_index
    FROM json_to_recordset(${payload}::json) AS x(
      athlete_id uuid,
      bib text,
      grade_digit int,
      alpha_index int
    )
  `;
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
    const outcome = await withTransaction(async (tx) => {
      const batteryResult = await tx`
        SELECT hugo_group, senior_grad_year
        FROM testing_batteries
        WHERE id = ${id}
        FOR UPDATE
      `;
      if (!batteryResult.rows.length) return { status: "missing" as const };
      const stored = await readSheet(tx, id);
      if (stored.length > 0) return { status: "ok" as const, athletes: stored };

      const battery = batteryResult.rows[0] as {
        hugo_group: unknown;
        senior_grad_year: unknown;
      };
      const hugoGroup = asText(battery.hugo_group);
      const seniorGradYear = finiteInt(battery.senior_grad_year);
      if (!hugoGroup || seniorGradYear == null) return { status: "settings" as const };

      const rosterResult = await tx`
        SELECT a.id AS athlete_id, a.first_name, a.last_name, a.graduating_class
        FROM athletes a
        INNER JOIN athlete_hugo_memberships m ON m.athlete_id = a.id
        WHERE m.hugo_group = ${hugoGroup}
      `;
      const assigned = assignBibs(rosterFrom(rosterResult.rows), seniorGradYear, []);
      await insertBibRows(tx, id, assigned);
      return { status: "ok" as const, athletes: await readSheet(tx, id) };
    });

    if (outcome.status === "missing") {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (outcome.status === "settings") {
      return NextResponse.json({ error: "Battery is missing roster settings" }, { status: 500 });
    }
    const buffer = await renderHandSheet(outcome.athletes);
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
