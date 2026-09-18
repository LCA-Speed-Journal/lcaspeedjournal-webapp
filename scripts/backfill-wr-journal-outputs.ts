/**
 * Backfill Speed Journal entries from mapped weight-room set_results
 * (e.g. Standing Broad logged as 8.25ft that never dual-wrote).
 *
 * Requires POSTGRES_URL in .env.local or environment.
 *
 * Usage:
 *   npx tsx scripts/backfill-wr-journal-outputs.ts
 *   npx tsx scripts/backfill-wr-journal-outputs.ts --from=2026-09-01 --to=2026-09-30
 */
import { readFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
} catch {
  // optional
}

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

async function main() {
  const { backfillJournalFromMappedSetResults } = await import(
    "../src/lib/norms/weight-room-journal"
  );
  const result = await backfillJournalFromMappedSetResults({
    from: argValue("--from"),
    to: argValue("--to"),
  });
  console.log(
    JSON.stringify(
      {
        movements_mapped: result.movements_mapped,
        athlete_date_groups: result.groups,
        journal_entries_written: result.entry_ids.length,
        warnings: result.warnings,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
