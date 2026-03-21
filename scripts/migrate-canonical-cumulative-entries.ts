/**
 * Backfill canonical cumulative metric keys for 0-start components.
 *
 * Run:
 *   npx tsx scripts/migrate-canonical-cumulative-entries.ts --dry-run
 *   npx tsx scripts/migrate-canonical-cumulative-entries.ts
 *
 * Requires POSTGRES_URL in .env.local or environment.
 */
import { createPool } from "@vercel/postgres";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import metricsData from "../src/lib/metrics.json";
import {
  resolveCanonicalZeroStartRow,
  type MetricRegistry,
} from "../src/lib/canonical-cumulative";

type EntryRow = {
  id: string;
  metric_key: string;
  component: string | null;
  interval_index: number | null;
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

function parseEndMeters(component: string | null): number | null {
  if (!component) return null;
  const m = component.match(/^0-(\d+)m$/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    console.error("POSTGRES_URL is not set. Use .env.local or set POSTGRES_URL.");
    process.exit(1);
  }

  const pool = createPool({ connectionString: postgresUrl });
  const sql = pool.sql.bind(pool);
  const registry = metricsData as MetricRegistry;

  const { rows } = await sql`
    SELECT id, metric_key, component, interval_index
    FROM entries
    WHERE component ~ '^0-[0-9]+m$'
    ORDER BY created_at ASC
  `;

  const entries = rows as EntryRow[];
  let examined = 0;
  let updated = 0;
  let unchanged = 0;
  let unresolved = 0;

  if (!dryRun) {
    await sql`BEGIN`;
  }

  try {
    for (const row of entries) {
      examined += 1;
      const endM = parseEndMeters(row.component);
      if (endM == null) {
        unresolved += 1;
        continue;
      }

      const canonical = resolveCanonicalZeroStartRow(
        row.metric_key,
        endM,
        registry
      );
      if (!canonical) {
        unresolved += 1;
        continue;
      }

      const nextMetric = canonical.metric_key;
      const nextComponent = canonical.component;
      const changed =
        row.metric_key !== nextMetric ||
        row.component !== nextComponent ||
        row.interval_index !== null;

      if (!changed) {
        unchanged += 1;
        continue;
      }

      updated += 1;
      if (!dryRun) {
        await sql`
          UPDATE entries
          SET
            metric_key = ${nextMetric},
            component = ${nextComponent},
            interval_index = NULL
          WHERE id = ${row.id}
        `;
      }
    }

    if (!dryRun) {
      await sql`COMMIT`;
    }
  } catch (err) {
    if (!dryRun) {
      await sql`ROLLBACK`;
    }
    throw err;
  } finally {
    await pool.end();
  }

  console.log("Canonical cumulative migration complete.");
  console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`Examined: ${examined}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Unresolved (no canonical mapping): ${unresolved}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
