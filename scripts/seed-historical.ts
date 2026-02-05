/**
 * Seed historical 2024 and 2025 data from LCA-Speed-Journal transformed CSVs
 * into Vercel Postgres (athletes, sessions, entries).
 *
 * Uses: 2024-Data-Transformed.csv, 2025-Data-Transformed.csv
 * Schema: session_id, session_date, phase, phase_week, metric_key, athlete_name,
 *         athlete_gender, athlete_graduating_class, input_value, display_value, input_units
 *
 * Run: npx tsx scripts/seed-historical.ts
 * Or:  SEED_DATA_DIR="C:\path\to\LCA-Speed-Journal\data\historical" npx tsx scripts/seed-historical.ts
 *
 * Requires POSTGRES_URL in .env.local (or env).
 */
import { createPool } from "@vercel/postgres";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load .env.local if present (simple key=value, no multiline)
try {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {
  // ignore
}

const SEED_DATA_DIR =
  process.env.SEED_DATA_DIR || join(process.cwd(), "scripts", "seed-data");

type CsvRow = Record<string, string>;

function parseCsv(path: string): CsvRow[] {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: CsvRow = {};
    headers.forEach((h, j) => {
      row[h] = values[j]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function getCol(row: CsvRow, key: string): string {
  return row[key] ?? "";
}

function parseNum(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parsePhaseWeek(s: string): number {
  const n = parseNum(s);
  return n != null ? Math.floor(n) : 1;
}

/** Split "First Last" into [first, last]; fallback to [name, ""] */
function splitName(full: string): [string, string] {
  const t = full.trim();
  const i = t.lastIndexOf(" ");
  if (i <= 0) return [t || "Unknown", ""];
  return [t.slice(0, i).trim(), t.slice(i + 1).trim()];
}

async function main() {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    console.error("POSTGRES_URL is not set. Use .env.local or set SEED_DATA_DIR and POSTGRES_URL.");
    process.exit(1);
  }

  const pool = createPool({ connectionString: postgresUrl });
  const sql = pool.sql.bind(pool);

  // Load metrics registry to validate metric_key
  const metricsPath = join(process.cwd(), "src", "lib", "metrics.json");
  const metricsJson = JSON.parse(readFileSync(metricsPath, "utf-8")) as Record<string, unknown>;
  const knownMetrics = new Set(Object.keys(metricsJson));

  const files = ["2024-Data-Transformed.csv", "2025-Data-Transformed.csv"];
  const allRows: CsvRow[] = [];
  for (const f of files) {
    const fullPath = join(SEED_DATA_DIR, f);
    if (!existsSync(fullPath)) {
      console.warn("Skip (not found):", fullPath);
      continue;
    }
    const rows = parseCsv(fullPath);
    console.log("Loaded", rows.length, "rows from", f);
    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    console.error("No rows found. Put 2024-Data-Transformed.csv and 2025-Data-Transformed.csv in scripts/seed-data or set SEED_DATA_DIR.");
    process.exit(1);
  }

  // Unique athletes: key = "firstName|lastName|graduatingClass" (null as "")
  const athleteKey = (first: string, last: string, grad: number | null) =>
    `${first}|${last}|${grad ?? ""}`;
  const athleteMap = new Map<string, { first: string; last: string; gender: string; grad: number | null }>();
  // Unique sessions: key = "session_date|phase|phase_week"
  const sessionKey = (date: string, phase: string, week: number) =>
    `${date}|${phase}|${week}`;
  const sessionMap = new Map<string, { session_date: string; phase: string; phase_week: number }>();
  // Entries to insert: (sessionKey, athleteKey, metric_key, value, display_value, units, raw_input)
  const entries: { sessionKey: string; athleteKey: string; metric_key: string; value: number; display_value: number; units: string; raw_input: string }[] = [];

  let skippedMetric = 0;
  for (const row of allRows) {
    const metric_key = getCol(row, "metric_key");
    if (!knownMetrics.has(metric_key)) {
      skippedMetric++;
      continue;
    }
    const session_date = getCol(row, "session_date").slice(0, 10);
    const phase = getCol(row, "phase") || "Preseason";
    const phase_week = parsePhaseWeek(getCol(row, "phase_week"));
    const sk = sessionKey(session_date, phase, phase_week);
    if (!sessionMap.has(sk)) {
      sessionMap.set(sk, { session_date, phase, phase_week });
    }

    const fullName = getCol(row, "athlete_name");
    const [first, last] = splitName(fullName);
    const gender = (getCol(row, "athlete_gender") || "M").toUpperCase().slice(0, 1);
    const gradRaw = getCol(row, "athlete_graduating_class");
    const grad = parseNum(gradRaw);
    const gradInt = grad != null ? Math.floor(grad) : null;
    const ak = athleteKey(first, last, gradInt);
    if (!athleteMap.has(ak)) {
      athleteMap.set(ak, { first, last, gender, grad: gradInt });
    }

    const input_value = parseNum(getCol(row, "input_value"));
    const display_value = parseNum(getCol(row, "display_value"));
    const units = getCol(row, "input_units") || "s";
    if (input_value == null || display_value == null) continue;
    entries.push({
      sessionKey: sk,
      athleteKey: ak,
      metric_key,
      value: input_value,
      display_value,
      units,
      raw_input: String(getCol(row, "input_value")),
    });
  }

  if (skippedMetric > 0) {
    console.log("Skipped rows with unknown metric_key:", skippedMetric);
  }

  console.log("Unique athletes:", athleteMap.size);
  console.log("Unique sessions:", sessionMap.size);
  console.log("Entries to insert:", entries.length);

  // Resolve athlete ids: select existing or insert
  const athleteIdByKey = new Map<string, string>();
  for (const [key, a] of athleteMap) {
    const existing =
      a.grad == null
        ? await sql`
            SELECT id FROM athletes
            WHERE first_name = ${a.first} AND last_name = ${a.last} AND graduating_class IS NULL
            LIMIT 1
          `
        : await sql`
            SELECT id FROM athletes
            WHERE first_name = ${a.first} AND last_name = ${a.last} AND graduating_class = ${a.grad}
            LIMIT 1
          `;
    const rows = existing.rows as { id: string }[];
    if (rows.length > 0) {
      athleteIdByKey.set(key, rows[0].id);
    } else {
      const ins = await sql`
        INSERT INTO athletes (first_name, last_name, gender, graduating_class, athlete_type)
        VALUES (${a.first}, ${a.last}, ${a.gender}, ${a.grad}, 'athlete')
        RETURNING id
      `;
      const id = (ins.rows[0] as { id: string }).id;
      athleteIdByKey.set(key, id);
    }
  }
  console.log("Athletes upserted.");

  // Resolve session ids: select existing or insert
  const sessionIdByKey = new Map<string, string>();
  for (const [key, s] of sessionMap) {
    const existing = await sql`
      SELECT id FROM sessions
      WHERE session_date = ${s.session_date}::date AND phase = ${s.phase} AND phase_week = ${s.phase_week}
      LIMIT 1
    `;
    const rows = existing.rows as { id: string }[];
    if (rows.length > 0) {
      sessionIdByKey.set(key, rows[0].id);
    } else {
      const ins = await sql`
        INSERT INTO sessions (session_date, phase, phase_week)
        VALUES (${s.session_date}::date, ${s.phase}, ${s.phase_week})
        RETURNING id
      `;
      const id = (ins.rows[0] as { id: string }).id;
      sessionIdByKey.set(key, id);
    }
  }
  console.log("Sessions upserted.");

  // Insert entries in batches
  let inserted = 0;
  const BATCH = 200;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    for (const e of batch) {
      const session_id = sessionIdByKey.get(e.sessionKey);
      const athlete_id = athleteIdByKey.get(e.athleteKey);
      if (!session_id || !athlete_id) continue;
      await sql`
        INSERT INTO entries (session_id, athlete_id, metric_key, value, display_value, units, raw_input)
        VALUES (${session_id}, ${athlete_id}, ${e.metric_key}, ${e.value}, ${e.display_value}, ${e.units}, ${e.raw_input})
      `;
      inserted++;
    }
  }
  console.log("Entries inserted:", inserted);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
