/**
 * Rewrite legacy speed entries into acceleration and build-in windows.
 *
 * Dry-run (read-only; prints the plan and exits 0):
 *   npx tsx scripts/migrate-speed-windows.ts
 *
 * Apply (schema SQL, then updates and deletes in one transaction):
 *   npx tsx scripts/migrate-speed-windows.ts --apply
 *
 * Requires POSTGRES_URL in .env.local or the environment.
 */
import { createPool, type VercelPool } from "@vercel/postgres";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { planSpeedMigration, type LegacyEntry, type SpeedMigrationPlan } from "../src/lib/speed/migrate";
import { LEGACY_SPEED_KEYS } from "../src/lib/speed/windows";

type RawEntry = {
  id: string;
  session_id: string;
  athlete_id: string;
  metric_key: string;
  component: string | null;
  value: string | number | null;
  display_value: string | number | null;
  units: string;
};

// Load .env.local if present
try {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // ignore env load failures
}

function sqlStatements(sqlText: string): string[] {
  return sqlText
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function toLegacyEntry(row: RawEntry): LegacyEntry {
  return {
    id: row.id,
    session_id: row.session_id,
    athlete_id: row.athlete_id,
    metric_key: row.metric_key,
    component: row.component,
    value: Number(row.value),
    display_value: Number(row.display_value),
    units: row.units,
  };
}

function printPlan(plan: SpeedMigrationPlan): void {
  console.log(`Updates: ${plan.updates.length}`);
  console.log(`Deletes: ${plan.deleteIds.length}`);
  console.log(`Skipped: ${plan.skipped.length}`);
  console.log(`Unparsed: ${plan.unparsed.length}`);
  console.log(`Conflicts: ${plan.conflicts.length}`);
  for (const conflict of plan.conflicts) {
    console.log(`Conflict ${conflict.key}: ${conflict.ids.join(", ")}`);
  }
  for (const row of plan.unparsed) {
    console.log(`Unparsed ${row.id}`);
  }
}

async function applyMigration(
  pool: VercelPool,
  sqlText: string,
  plan: SpeedMigrationPlan
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      for (const statement of sqlStatements(sqlText)) {
        await client.query(statement);
      }
      for (const update of plan.updates) {
        await client.query(
          `UPDATE entries
           SET metric_key = $1,
               component = $2,
               interval_index = NULL,
               value = $3,
               display_value = $4,
               units = $5,
               distance_unit = $6,
               start_distance = $7,
               end_distance = $8,
               legacy_metric_key = $9,
               legacy_component = $10
           WHERE id = $11`,
          [
            update.metric_key,
            update.component,
            update.value,
            update.display_value,
            update.units,
            update.distance_unit,
            update.start_distance,
            update.end_distance,
            update.legacy_metric_key,
            update.legacy_component,
            update.id,
          ]
        );
      }
      if (plan.deleteIds.length > 0) {
        await client.query("DELETE FROM entries WHERE id = ANY($1::uuid[])", [plan.deleteIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Rollback failed", rollbackErr);
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    console.error("POSTGRES_URL is not set. Use .env.local or set POSTGRES_URL.");
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "scripts", "migrate-speed-windows.sql");
  const sqlText = readFileSync(sqlPath, "utf-8");

  const pool = createPool({ connectionString: postgresUrl });
  try {
    const keys = [...LEGACY_SPEED_KEYS, "MaxVelocity"];
    const { rows } = await pool.query<RawEntry>(
      `SELECT id, session_id, athlete_id, metric_key, component, value, display_value, units
       FROM entries
       WHERE metric_key = ANY($1::text[])`,
      [keys]
    );

    const plan = planSpeedMigration(rows.map(toLegacyEntry));
    console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
    printPlan(plan);

    // Dry-run ends here: no transaction, no schema SQL, no updates, no deletes.
    if (!apply) return;

    await applyMigration(pool, sqlText, plan);
    console.log("Speed window migration applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
