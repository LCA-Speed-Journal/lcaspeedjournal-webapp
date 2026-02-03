/**
 * Data validation for LCA Speed Journal.
 * Analyzes entries, athletes, and sessions for potential labeling errors and trends.
 *
 * Run: npx tsx scripts/validate-data.ts
 * Requires POSTGRES_URL in .env.local or env.
 */
import { createPool } from "@vercel/postgres";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

// Load .env.local if present
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

type MetricDef = { display_units: string; input_structure?: string; default_splits?: string[] };
const METRICS_PATH = join(process.cwd(), "src", "lib", "metrics.json");

function loadMetrics(): Record<string, MetricDef> {
  const raw = readFileSync(METRICS_PATH, "utf-8");
  return JSON.parse(raw) as Record<string, MetricDef>;
}

type ValidationIssue = {
  category: string;
  code: string;
  message: string;
  count?: number;
  sample_ids?: string[];
  sample?: Record<string, unknown>[];
  suggested_action?: string;
};

/** Sort numeric array and return Q1, median, Q3, IQR. */
function quartiles(arr: number[]): { q1: number; median: number; q3: number; iqr: number } {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = (n - 1) / 2;
  const q1 = sorted[Math.floor((n - 1) * 0.25)] ?? sorted[0];
  const median = ((sorted[Math.floor(mid)] ?? 0) + (sorted[Math.ceil(mid)] ?? 0)) / 2;
  const q3 = sorted[Math.floor((n - 1) * 0.75)] ?? sorted[n - 1];
  return { q1, median, q3, iqr: q3 - q1 };
}

/** Convert stored distance to feet for comparable cross-metric checks. Handles entries stored in in, m, cm, or ft (e.g. Seated-Broad in inches, Triple-Broad in meters on 3/26). */
function toComparableFt(units: string, value: number): number {
  const u = (units || "").toLowerCase();
  if (u === "ft") return value;
  if (u === "in" || u === "inch") return value / 12;
  if (u === "m") return value * 3.28084;
  if (u === "cm") return value / 30.48;
  return value;
}

/** Higher-is-better (e.g. jumps in ft): "more" should be >= "less". Lower-is-better (e.g. time in s): "less" value should be <= "more" value (shorter time = better). */
const CROSS_METRIC_RULES: { less: string; more: string; higher_is_better: boolean }[] = [
  { less: "Seated-Broad", more: "Standing-Broad", higher_is_better: true },
  { less: "Standing-Broad", more: "Triple-Broad", higher_is_better: true },
  { less: "Seated-Broad", more: "Triple-Broad", higher_is_better: true },
  { less: "5m_Accel", more: "10m_Accel", higher_is_better: false },
  { less: "10m_Accel", more: "20m_Accel", higher_is_better: false },
  { less: "20m_Accel", more: "30m_Accel", higher_is_better: false },
  { less: "30m_Accel", more: "40m_Sprint", higher_is_better: false },
  { less: "40m_Sprint", more: "50m_Sprint", higher_is_better: false },
];

async function main() {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    console.error("POSTGRES_URL is not set. Use .env.local or set POSTGRES_URL.");
    process.exit(1);
  }

  const pool = createPool({ connectionString: postgresUrl });
  const sql = pool.sql.bind(pool);
  const metrics = loadMetrics();
  const knownMetricKeys = new Set(Object.keys(metrics));
  const issues: ValidationIssue[] = [];

  // ---- 1. Entries: metric_key not in registry ----
  const allEntryMetrics = await sql`
    SELECT DISTINCT metric_key FROM entries
  `;
  const unknownKeys = (allEntryMetrics.rows as { metric_key: string }[])
    .map((r) => r.metric_key)
    .filter((k) => k && !knownMetricKeys.has(k));
  if (unknownKeys.length > 0) {
    const sampleRows = await sql`
      SELECT e.id, e.metric_key, e.value, e.units, e.raw_input
      FROM entries e
      WHERE e.metric_key = ${unknownKeys[0]}
      LIMIT 5
    `;
    const totalBad = await sql`
      SELECT COUNT(*)::int AS cnt FROM entries
      WHERE metric_key = ANY(${unknownKeys})
    `;
    issues.push({
      category: "entries",
      code: "unknown_metric_key",
      message: `Entries use metric_key not in metrics.json: ${unknownKeys.join(", ")}`,
      count: (totalBad.rows[0] as { cnt: number }).cnt,
      sample_ids: (sampleRows.rows as { id: string }[]).map((r) => r.id),
      sample: sampleRows.rows as Record<string, unknown>[],
      suggested_action: "Fix metric_key to match a key in src/lib/metrics.json, or add the metric to the registry.",
    });
  }

  // ---- 2. Entries: units mismatch (entry.units vs metric display_units) ----
  const unitsMismatch: { metric_key: string; entry_units: string; expected_units: string; count: number }[] = [];
  for (const [key, def] of Object.entries(metrics)) {
    const expected = def.display_units;
    const res = await sql`
      SELECT units, COUNT(*)::int AS cnt
      FROM entries
      WHERE metric_key = ${key}
      GROUP BY units
    `;
    for (const row of res.rows as { units: string; cnt: number }[]) {
      if (row.units !== expected) {
        unitsMismatch.push({
          metric_key: key,
          entry_units: row.units,
          expected_units: expected,
          count: row.cnt,
        });
      }
    }
  }
  if (unitsMismatch.length > 0) {
    issues.push({
      category: "entries",
      code: "units_mismatch",
      message: "Entries have units that don't match the metric's display_units.",
      count: unitsMismatch.reduce((s, u) => s + u.count, 0),
      sample: unitsMismatch.slice(0, 15).map((u) => ({ ...u })),
      suggested_action: "Update entries.units to match metrics.json display_units for each metric_key (or re-import with correct units).",
    });
  }

  // ---- 3. Athletes: gender not M/F/Male/Female ----
  const validGenders = ["m", "f", "male", "female"];
  const badGender = await sql`
    SELECT id, first_name, last_name, gender
    FROM athletes
    WHERE LOWER(TRIM(gender)) NOT IN ('m', 'f', 'male', 'female')
       OR gender IS NULL OR TRIM(gender) = ''
  `;
  if (badGender.rows.length > 0) {
    issues.push({
      category: "athletes",
      code: "invalid_gender",
      message: "Athletes with gender not in M/F/Male/Female (leaderboard group_by gender may misclassify).",
      count: badGender.rows.length,
      sample_ids: (badGender.rows as { id: string }[]).map((r) => r.id),
      sample: badGender.rows.slice(0, 10) as Record<string, unknown>[],
      suggested_action: "Set gender to M, F, Male, or Female (case-insensitive).",
    });
  }

  // ---- 4. Athletes: athlete_type not athlete|staff|alumni ----
  const badType = await sql`
    SELECT id, first_name, last_name, athlete_type
    FROM athletes
    WHERE athlete_type IS NULL OR athlete_type NOT IN ('athlete', 'staff', 'alumni')
  `;
  if (badType.rows.length > 0) {
    issues.push({
      category: "athletes",
      code: "invalid_athlete_type",
      message: "Athletes with athlete_type not in athlete|staff|alumni.",
      count: badType.rows.length,
      sample: badType.rows.slice(0, 10) as Record<string, unknown>[],
      suggested_action: "Set athlete_type to 'athlete', 'staff', or 'alumni'.",
    });
  }

  // ---- 5. Duplicate entries (same session, athlete, metric, interval_index, component) ----
  const dupes = await sql`
    SELECT session_id, athlete_id, metric_key, interval_index, component, COUNT(*)::int AS cnt
    FROM entries
    GROUP BY session_id, athlete_id, metric_key, interval_index, component
    HAVING COUNT(*) > 1
  `;
  if (dupes.rows.length > 0) {
    const totalDupedRows = (dupes.rows as { cnt: number }[]).reduce((s, r) => s + r.cnt, 0);
    issues.push({
      category: "entries",
      code: "duplicate_entry",
      message: "Duplicate entries (same session, athlete, metric, interval_index, component).",
      count: totalDupedRows,
      sample: dupes.rows.slice(0, 10) as Record<string, unknown>[],
      suggested_action: "Keep one row per (session_id, athlete_id, metric_key, interval_index, component) and delete or merge duplicates.",
    });
  }

  // ---- 6. Paired_components metrics with component not L or R ----
  const pairedMetrics = Object.entries(metrics)
    .filter(([, d]) => d.input_structure === "paired_components")
    .map(([k]) => k);
  if (pairedMetrics.length > 0) {
    const badComponent = await sql`
      SELECT e.id, e.metric_key, e.component, e.value
      FROM entries e
      WHERE e.metric_key = ANY(${pairedMetrics})
        AND (e.component IS NULL OR TRIM(e.component) NOT IN ('L', 'R'))
    `;
    if (badComponent.rows.length > 0) {
      const countRes = await sql`
        SELECT COUNT(*)::int AS cnt FROM entries e
        WHERE e.metric_key = ANY(${pairedMetrics})
          AND (e.component IS NULL OR TRIM(e.component) NOT IN ('L', 'R'))
      `;
      issues.push({
        category: "entries",
        code: "paired_component_invalid",
        message: "Entries for paired_components metrics (e.g. ISO L/R) have component not L or R.",
        count: (countRes.rows[0] as { cnt: number }).cnt,
        sample: badComponent.rows.slice(0, 10) as Record<string, unknown>[],
        suggested_action: "Set component to 'L' or 'R' for these metrics.",
      });
    }
  }

  // ---- 7. Sessions: session_date in future ----
  const futureSessions = await sql`
    SELECT id, session_date, phase, phase_week
    FROM sessions
    WHERE session_date > CURRENT_DATE
  `;
  if (futureSessions.rows.length > 0) {
    issues.push({
      category: "sessions",
      code: "session_date_future",
      message: "Sessions with session_date in the future.",
      count: futureSessions.rows.length,
      sample: futureSessions.rows as Record<string, unknown>[],
      suggested_action: "Correct session_date or remove test data.",
    });
  }

  // ---- 8. Sessions: session_date very old (before 2020) ----
  const oldSessions = await sql`
    SELECT id, session_date, phase, phase_week
    FROM sessions
    WHERE session_date < '2020-01-01'
  `;
  if (oldSessions.rows.length > 0) {
    issues.push({
      category: "sessions",
      code: "session_date_very_old",
      message: "Sessions with session_date before 2020 (may be typos).",
      count: oldSessions.rows.length,
      sample: oldSessions.rows.slice(0, 10) as Record<string, unknown>[],
      suggested_action: "Confirm dates; fix if entry error.",
    });
  }

  // ---- 9. Entries: outlier values (heuristic) ----
  const outlierChecks: { metric_key: string; min?: number; max?: number; unit: string; count: number }[] = [];
  const speedTimeMetrics = ["5m_Accel", "10m_Accel", "20m_Accel", "30m_Accel", "40m_Sprint", "50m_Sprint", "100m", "200m", "400m"];
  for (const mk of speedTimeMetrics) {
    if (!knownMetricKeys.has(mk)) continue;
    const r = await sql`
      SELECT COUNT(*)::int AS cnt FROM entries
      WHERE metric_key = ${mk} AND (value < 1 OR value > 120)
    `;
    const cnt = (r.rows[0] as { cnt: number }).cnt;
    if (cnt > 0) outlierChecks.push({ metric_key: mk, min: 1, max: 120, unit: "s", count: cnt });
  }
  const verticalJump = await sql`
    SELECT COUNT(*)::int AS cnt FROM entries
    WHERE metric_key = 'Vertical Jump' AND (display_value < 0 OR display_value > 60)
  `;
  if ((verticalJump.rows[0] as { cnt: number }).cnt > 0) {
    outlierChecks.push({
      metric_key: "Vertical Jump",
      min: 0,
      max: 60,
      unit: "in",
      count: (verticalJump.rows[0] as { cnt: number }).cnt,
    });
  }
  if (outlierChecks.length > 0) {
    issues.push({
      category: "entries",
      code: "outlier_value",
      message: "Entries with values outside typical range (possible typo or wrong unit).",
      count: outlierChecks.reduce((s, o) => s + o.count, 0),
      sample: outlierChecks as unknown as Record<string, unknown>[],
      suggested_action: "Review raw_input and value/display_value; correct or remove if typo.",
    });
  }

  // ---- 10. Trend: metric_key usage (detect possible wrong metric) ----
  const metricCounts = await sql`
    SELECT metric_key, COUNT(*)::int AS cnt
    FROM entries
    GROUP BY metric_key
    ORDER BY cnt DESC
  `;
  const singleUseMetrics = (metricCounts.rows as { metric_key: string; cnt: number }[]).filter(
    (r) => r.cnt === 1
  );
  if (singleUseMetrics.length > 0 && metricCounts.rows.length > 5) {
    issues.push({
      category: "entries",
      code: "single_use_metric",
      message: `Metrics that appear in only one entry (possible mislabel): ${singleUseMetrics.map((m) => m.metric_key).slice(0, 10).join(", ")}${singleUseMetrics.length > 10 ? "..." : ""}.`,
      count: singleUseMetrics.length,
      sample: singleUseMetrics.slice(0, 15) as unknown as Record<string, unknown>[],
      suggested_action: "Confirm these metric_keys are correct; consider merging with a more common metric if mislabeled.",
    });
  }

  // ---- 11. Per-athlete trend outliers (value doesn't match athlete's usual range) ----
  const entriesWithAthlete = await sql`
    SELECT e.id, e.athlete_id, e.session_id, e.metric_key, e.display_value, e.value, e.units,
           s.session_date::text AS session_date,
           a.first_name, a.last_name
    FROM entries e
    JOIN sessions s ON s.id = e.session_id
    JOIN athletes a ON a.id = e.athlete_id
    WHERE e.interval_index IS NULL AND (e.component IS NULL OR e.component = '')
  `;
  type Row = { id: string; athlete_id: string; session_id: string; metric_key: string; display_value: number; value: number; units: string; session_date: string; first_name: string; last_name: string };
  const rows = entriesWithAthlete.rows as Row[];
  const key = (a: string, m: string) => `${a}|${m}`;
  const byAthleteMetric = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r.athlete_id, r.metric_key);
    if (!byAthleteMetric.has(k)) byAthleteMetric.set(k, []);
    byAthleteMetric.get(k)!.push(r);
  }
  const athleteOutliers: { id: string; athlete_name: string; metric_key: string; session_date: string; display_value: number; athlete_median: number; direction: string }[] = [];
  const MIN_POINTS_FOR_TREND = 3;
  const IQR_MULTIPLIER = 2;
  for (const [, group] of byAthleteMetric) {
    if (group.length < MIN_POINTS_FOR_TREND) continue;
    const values = group.map((r) => r.display_value);
    const { q1, median, q3, iqr } = quartiles(values);
    const lower = q1 - IQR_MULTIPLIER * iqr;
    const upper = q3 + IQR_MULTIPLIER * iqr;
    for (const r of group) {
      if (r.display_value < lower) {
        athleteOutliers.push({
          id: r.id,
          athlete_name: `${r.first_name} ${r.last_name}`,
          metric_key: r.metric_key,
          session_date: r.session_date,
          display_value: r.display_value,
          athlete_median: median,
          direction: "abnormally_low",
        });
      } else if (r.display_value > upper) {
        athleteOutliers.push({
          id: r.id,
          athlete_name: `${r.first_name} ${r.last_name}`,
          metric_key: r.metric_key,
          session_date: r.session_date,
          display_value: r.display_value,
          athlete_median: median,
          direction: "abnormally_high",
        });
      }
    }
  }
  if (athleteOutliers.length > 0) {
    issues.push({
      category: "trends",
      code: "per_athlete_trend_outlier",
      message: "Entries that don't match the athlete's usual range for that metric (possible typo or mislabel).",
      count: athleteOutliers.length,
      sample: athleteOutliers.slice(0, 20),
      suggested_action: "Review raw_input and session; confirm metric_key and value. May be real improvement/regression or data error.",
    });
  }

  // ---- 12. Cross-metric consistency (e.g. Triple-Broad > Standing-Broad > Seated-Broad) ----
  const entriesBySessionAthlete = await sql`
    SELECT e.id, e.athlete_id, e.session_id, e.metric_key, e.display_value, e.value, e.units,
           s.session_date::text AS session_date,
           a.first_name, a.last_name
    FROM entries e
    JOIN sessions s ON s.id = e.session_id
    JOIN athletes a ON a.id = e.athlete_id
    WHERE e.interval_index IS NULL AND (e.component IS NULL OR e.component = '')
  `;
  const allRows = entriesBySessionAthlete.rows as Row[];
  const bySessionAthlete = new Map<string, Map<string, Row>>();
  for (const r of allRows) {
    const sk = `${r.session_id}|${r.athlete_id}`;
    if (!bySessionAthlete.has(sk)) bySessionAthlete.set(sk, new Map());
    const map = bySessionAthlete.get(sk)!;
    const existing = map.get(r.metric_key);
    const isHigherBetter = metrics[r.metric_key]?.display_units !== "s";
    const currentBest = isHigherBetter
      ? toComparableFt(r.units, r.display_value)
      : r.value;
    if (!existing) {
      map.set(r.metric_key, r);
    } else {
      const existingBest = isHigherBetter
        ? toComparableFt(existing.units, existing.display_value)
        : existing.value;
      if (isHigherBetter ? currentBest > existingBest : currentBest < existingBest)
        map.set(r.metric_key, r);
    }
  }
  const crossMetricViolations: { athlete_name: string; session_date: string; rule: string; less_metric: string; more_metric: string; less_value: number; more_value: number; less_value_ft?: number; more_value_ft?: number; entry_id_less?: string; entry_id_more?: string }[] = [];
  for (const [, metricMap] of bySessionAthlete) {
    for (const rule of CROSS_METRIC_RULES) {
      const lessRow = metricMap.get(rule.less);
      const moreRow = metricMap.get(rule.more);
      if (!lessRow || !moreRow) continue;
      const lessVal = rule.higher_is_better
        ? toComparableFt(lessRow.units, lessRow.display_value)
        : lessRow.value;
      const moreVal = rule.higher_is_better
        ? toComparableFt(moreRow.units, moreRow.display_value)
        : moreRow.value;
      const ok = moreVal >= lessVal;
      if (!ok) {
        crossMetricViolations.push({
          athlete_name: `${lessRow.first_name} ${lessRow.last_name}`,
          session_date: lessRow.session_date,
          rule: rule.higher_is_better
            ? `${rule.more} (${moreVal.toFixed(2)} ft) should be >= ${rule.less} (${lessVal.toFixed(2)} ft) — values normalized from stored units`
            : `${rule.more} time (${moreVal}s) should be >= ${rule.less} time (${lessVal}s)`,
          less_metric: rule.less,
          more_metric: rule.more,
          less_value: rule.higher_is_better ? lessRow.display_value : lessRow.value,
          more_value: rule.higher_is_better ? moreRow.display_value : moreRow.value,
          less_value_ft: rule.higher_is_better ? lessVal : undefined,
          more_value_ft: rule.higher_is_better ? moreVal : undefined,
          entry_id_less: lessRow.id,
          entry_id_more: moreRow.id,
        });
      }
    }
  }
  if (crossMetricViolations.length > 0) {
    issues.push({
      category: "trends",
      code: "cross_metric_order_violation",
      message: "Same-session entries violate expected order (e.g. Triple-Broad should be greater than Standing-Broad; 30m time should be greater than 10m). Possible misclassified metric or typo.",
      count: crossMetricViolations.length,
      sample: crossMetricViolations.slice(0, 20),
      suggested_action: "Confirm metric_key and value for both entries; fix if one was entered as wrong metric or wrong number.",
    });
  }

  // ---- Summary ----
  const summary = {
    total_issues: issues.length,
    by_category: {} as Record<string, number>,
    by_code: {} as Record<string, number>,
  };
  for (const i of issues) {
    summary.by_category[i.category] = (summary.by_category[i.category] || 0) + 1;
    summary.by_code[i.code] = (summary.by_code[i.code] || 0) + 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    summary,
    issues,
    stats: {
      total_entries: ((await sql`SELECT COUNT(*)::int AS c FROM entries`).rows[0] as { c: number }).c,
      total_athletes: ((await sql`SELECT COUNT(*)::int AS c FROM athletes`).rows[0] as { c: number }).c,
      total_sessions: ((await sql`SELECT COUNT(*)::int AS c FROM sessions`).rows[0] as { c: number }).c,
      distinct_metric_keys: ((await sql`SELECT COUNT(DISTINCT metric_key)::int AS c FROM entries`).rows[0] as { c: number }).c,
    },
  };

  // Human-readable output
  console.log("\n=== LCA Speed Journal — Data Validation Report ===\n");
  console.log("Stats:", report.stats);
  console.log("\nSummary: ", report.summary.total_issues, " issue categories found.\n");
  if (issues.length === 0) {
    console.log("No potential errors detected. Data looks consistent with schema and metrics registry.\n");
  } else {
    for (const issue of issues) {
      console.log(`[${issue.category}] ${issue.code}`);
      console.log(`  ${issue.message}`);
      if (issue.count != null) console.log(`  Count: ${issue.count}`);
      if (issue.suggested_action) console.log(`  Action: ${issue.suggested_action}`);
      if (issue.sample?.length) console.log("  Sample:", JSON.stringify(issue.sample.slice(0, 3), null, 0));
      console.log("");
    }
  }

  const outPath = join(process.cwd(), "scripts", "validation-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.log("Full report written to:", outPath);

  await pool.end();
  process.exit(issues.length > 0 ? 0 : 0); // exit 0 either way; report is the output
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
