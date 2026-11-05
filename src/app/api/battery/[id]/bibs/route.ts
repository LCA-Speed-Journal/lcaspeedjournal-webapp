/**
 * Assign and read testing-battery bibs. Coach only.
 * A null bibs_issued_at replaces every row. Once issued, stored bibs stay put.
 * The replace and the issue timestamp share one locked transaction, so a second
 * request cannot delete bibs after another request has already issued them.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, withTransaction, type DbSql } from "@/lib/db";
import { isBatterySchemaMissing, readPgError } from "@/lib/battery/load";
import {
  assignBibs,
  athletesForIssuedBibs,
  type BibAthlete,
  type IssuedBib,
} from "@/lib/battery/bibs";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

type BibWriteRow = {
  athlete_id: string;
  bib: string;
  grade_digit: number;
  alpha_index: number;
};

type SheetRow = {
  bib: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
  grade_digit: number;
};

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
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

function issuedFrom(rows: unknown[]): IssuedBib[] {
  const out: IssuedBib[] = [];
  for (const row of rows) {
    const rec = row as { athlete_id?: unknown; bib?: unknown };
    if (rec.athlete_id == null || rec.bib == null) continue;
    out.push({ athlete_id: String(rec.athlete_id), bib: String(rec.bib) });
  }
  return out;
}

function sheetForRoster(
  roster: BibAthlete[],
  assigned: BibWriteRow[],
  issued: IssuedBib[]
): SheetRow[] {
  const storedById = new Map(issued.map((row) => [row.athlete_id, row.bib]));
  const assignedById = new Map<string, BibWriteRow>();
  for (const row of assigned) {
    if (storedById.has(row.athlete_id)) continue;
    assignedById.set(row.athlete_id, row);
  }
  const sheet: SheetRow[] = [];
  for (const athlete of roster) {
    const storedBib = storedById.get(athlete.athlete_id);
    if (storedBib) {
      const digit = Number(storedBib[0]);
      sheet.push({
        bib: storedBib,
        athlete_id: athlete.athlete_id,
        first_name: athlete.first_name,
        last_name: athlete.last_name,
        grade_digit: digit === 1 || digit === 2 || digit === 3 || digit === 4 ? digit : 0,
      });
      continue;
    }
    const row = assignedById.get(athlete.athlete_id);
    if (!row) continue;
    sheet.push({
      bib: row.bib,
      athlete_id: athlete.athlete_id,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      grade_digit: row.grade_digit,
    });
  }
  return sheet;
}

async function readIssueFlag(request: NextRequest): Promise<boolean> {
  const text = await request.text();
  if (text.trim() === "") return false;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (body == null || typeof body !== "object") return false;
  return (body as { issue?: unknown }).issue === true;
}

async function insertBibRows(tx: DbSql, batteryId: string, rows: BibWriteRow[]) {
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

async function replaceBatteryBibs(tx: DbSql, batteryId: string, rows: BibWriteRow[]) {
  await tx`DELETE FROM testing_battery_bibs WHERE battery_id = ${batteryId}`;
  await insertBibRows(tx, batteryId, rows);
}

async function insertNewBibs(tx: DbSql, batteryId: string, rows: BibWriteRow[]) {
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
    WHERE NOT EXISTS (
      SELECT 1
      FROM testing_battery_bibs existing
      WHERE existing.battery_id = ${batteryId}::uuid
        AND existing.athlete_id = x.athlete_id
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
    const [batteryResult, bibResult] = await Promise.all([
      sql`SELECT id FROM testing_batteries WHERE id = ${id} LIMIT 1`,
      sql`
        SELECT b.bib, b.athlete_id, a.first_name, a.last_name, b.grade_digit
        FROM testing_battery_bibs b
        INNER JOIN athletes a ON a.id = b.athlete_id
        WHERE b.battery_id = ${id}
        ORDER BY b.grade_digit ASC, b.alpha_index ASC, b.bib ASC
      `,
    ]);
    if (!batteryResult.rows.length) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    const data: SheetRow[] = (bibResult.rows as {
      bib: unknown;
      athlete_id: unknown;
      first_name: unknown;
      last_name: unknown;
      grade_digit: unknown;
    }[]).map((row) => ({
      bib: asText(row.bib),
      athlete_id: asText(row.athlete_id),
      first_name: asText(row.first_name),
      last_name: asText(row.last_name),
      grade_digit: finiteInt(row.grade_digit) ?? 0,
    }));
    return NextResponse.json(data);
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("GET /api/battery/[id]/bibs:", err);
    return NextResponse.json({ error: "Failed to load bibs" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let issue = false;
  try {
    issue = await readIssueFlag(request);
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_JSON") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw err;
  }

  try {
    const { id } = await params;
    const outcome = await withTransaction(async (tx) => {
      const batteryResult = await tx`
        SELECT hugo_group, senior_grad_year, bibs_issued_at
        FROM testing_batteries
        WHERE id = ${id}
        FOR UPDATE
      `;
      if (!batteryResult.rows.length) return { status: "missing" as const };
      const battery = batteryResult.rows[0] as {
        hugo_group: unknown;
        senior_grad_year: unknown;
        bibs_issued_at: unknown;
      };
      const hugoGroup = asText(battery.hugo_group);
      const seniorGradYear = finiteInt(battery.senior_grad_year);
      if (!hugoGroup || seniorGradYear == null) return { status: "settings" as const };
      const issuedAt = battery.bibs_issued_at;

      const rosterResult = await tx`
        SELECT a.id AS athlete_id, a.first_name, a.last_name, a.graduating_class
        FROM athletes a
        INNER JOIN athlete_hugo_memberships m ON m.athlete_id = a.id
        WHERE m.hugo_group = ${hugoGroup}
      `;
      const roster = rosterFrom(rosterResult.rows);
      const storedResult =
        issuedAt == null
          ? { rows: [] as unknown[] }
          : await tx`
              SELECT athlete_id, bib
              FROM testing_battery_bibs
              WHERE battery_id = ${id}
            `;
      const issued = issuedAt == null ? [] : issuedFrom(storedResult.rows);
      const athletes =
        issuedAt == null ? roster : athletesForIssuedBibs(roster, issued, seniorGradYear);
      const assigned = assignBibs(athletes, seniorGradYear, issued);

      if (issuedAt == null) {
        await replaceBatteryBibs(tx, id, assigned);
        if (issue) {
          await tx`
            UPDATE testing_batteries
            SET bibs_issued_at = NOW()
            WHERE id = ${id} AND bibs_issued_at IS NULL
          `;
        }
      } else {
        const rosterIds = new Set(roster.map((athlete) => athlete.athlete_id));
        const storedIds = new Set(issued.map((row) => row.athlete_id));
        const newcomers = assigned.filter(
          (row) => rosterIds.has(row.athlete_id) && !storedIds.has(row.athlete_id)
        );
        await insertNewBibs(tx, id, newcomers);
      }

      return { status: "ok" as const, sheet: sheetForRoster(roster, assigned, issued) };
    });

    if (outcome.status === "missing") {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    if (outcome.status === "settings") {
      return NextResponse.json({ error: "Battery is missing roster settings" }, { status: 500 });
    }
    return NextResponse.json(outcome.sheet);
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    const { codes } = readPgError(err);
    if (codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("POST /api/battery/[id]/bibs:", err);
    return NextResponse.json({ error: "Failed to assign bibs" }, { status: 500 });
  }
}

export async function DELETE(
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
        SELECT id
        FROM testing_batteries
        WHERE id = ${id}
        FOR UPDATE
      `;
      if (!batteryResult.rows.length) return { status: "missing" as const };
      await tx`DELETE FROM testing_battery_bibs WHERE battery_id = ${id}`;
      await tx`
        UPDATE testing_batteries
        SET bibs_issued_at = NULL
        WHERE id = ${id}
      `;
      return { status: "ok" as const };
    });
    if (outcome.status === "missing") {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }
    return NextResponse.json({ reset: true });
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    console.error("DELETE /api/battery/[id]/bibs:", err);
    return NextResponse.json({ error: "Failed to reset bibs" }, { status: 500 });
  }
}
