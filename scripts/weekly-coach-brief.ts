/**
 * Weekly coach-email data brief for Hugo soccer / volleyball.
 *
 * Run:
 *   npx tsx scripts/weekly-coach-brief.ts --group soccer --from 2026-09-14 --to 2026-09-18 --baseline 2026-09-02
 *   npx tsx scripts/weekly-coach-brief.ts --group volleyball --from 2026-09-14 --to 2026-09-18 --baseline 2026-09-04
 *
 * Requires POSTGRES_URL in .env.local or environment.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load .env.local before any @/lib/db import
try {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
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
  // ignore
}

type CliArgs = {
  group: string;
  from: string;
  to: string;
  baseline: string | null;
  metrics: string[] | null;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    group: "",
    from: "",
    to: "",
    baseline: null,
    metrics: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--group" && next) {
      out.group = next;
      i++;
    } else if (a === "--from" && next) {
      out.from = next;
      i++;
    } else if (a === "--to" && next) {
      out.to = next;
      i++;
    } else if (a === "--baseline" && next) {
      out.baseline = next;
      i++;
    } else if (a === "--metrics" && next) {
      out.metrics = next.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    }
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultMetricsForGroup(group: string): string[] {
  if (group === "volleyball") return ["Vertical Jump", "10-5_RSI"];
  if (group === "soccer" || group === "womens_soccer") {
    return ["Vertical Jump", "5-10-5_Agility"];
  }
  return ["Vertical Jump"];
}

function pctDelta(
  current: number | null,
  reference: number | null
): number | null {
  if (current == null || reference == null || reference === 0) return null;
  return ((current - reference) / Math.abs(reference)) * 100;
}

function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

type NamedAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
};

type AttendanceSplit = NamedAthlete & {
  dates: string[];
};

type MetricMark = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  metric_key: string;
  component: string | null;
  value: number;
  units: string;
  session_date: string;
};

type AthleteMetricRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  metric_key: string;
  units: string | null;
  this_week: number | null;
  this_week_date: string | null;
  prior_week: number | null;
  prior_week_date: string | null;
  baseline: number | null;
  baseline_date: string | null;
  pct_vs_prior: number | null;
  pct_vs_baseline: number | null;
};

function displayName(a: { first_name: string; last_name: string }): string {
  return `${a.first_name} ${a.last_name}`.trim();
}

function sortByName<T extends { first_name: string; last_name: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const last = a.last_name.localeCompare(b.last_name);
    if (last !== 0) return last;
    return a.first_name.localeCompare(b.first_name);
  });
}

/** Prefer higher values for jumps/loads; lower for times (s). */
function isHigherBetter(units: string | null | undefined): boolean {
  const u = (units ?? "").trim().toLowerCase();
  if (u === "s" || u === "sec" || u === "secs" || u === "ms") return false;
  return true;
}

function pickBest(
  marks: MetricMark[],
  higherIsBetter: boolean
): MetricMark | null {
  if (marks.length === 0) return null;
  let best = marks[0];
  for (let i = 1; i < marks.length; i++) {
    const m = marks[i];
    if (higherIsBetter) {
      if (m.value > best.value) best = m;
    } else if (m.value < best.value) {
      best = m;
    }
  }
  return best;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.group || !args.from || !args.to) {
    console.error(
      "Usage: npx tsx scripts/weekly-coach-brief.ts --group soccer|volleyball --from YYYY-MM-DD --to YYYY-MM-DD [--baseline YYYY-MM-DD] [--metrics Vertical Jump,10-5_RSI]"
    );
    process.exit(1);
  }
  if (!DATE_RE.test(args.from) || !DATE_RE.test(args.to)) {
    console.error("from/to must be YYYY-MM-DD");
    process.exit(1);
  }
  if (args.baseline && !DATE_RE.test(args.baseline)) {
    console.error("baseline must be YYYY-MM-DD");
    process.exit(1);
  }
  if (!process.env.POSTGRES_URL) {
    console.error("POSTGRES_URL is not set (add to .env.local)");
    process.exit(1);
  }

  const { isHugoGroup } = await import("../src/lib/weight-room/constants");
  if (!isHugoGroup(args.group)) {
    console.error(`Invalid hugo_group: ${args.group}`);
    process.exit(1);
  }

  const {
    loadRoster,
    loadTeamAggregateInput,
  } = await import("../src/lib/weight-room/report-load");
  const {
    aggregateWeightRoomReport,
    priorWeekRange,
  } = await import("../src/lib/weight-room/report-aggregate");
  const { buildWeightRoomOverview } = await import(
    "../src/lib/weight-room/overview-aggregate"
  );
  const { sql } = await import("../src/lib/db");
  const { serializeDate } = await import(
    "../src/lib/weight-room/insert-template"
  );

  const metricKeys = args.metrics ?? defaultMetricsForGroup(args.group);
  const prior = priorWeekRange(args.from);

  const [input, roster] = await Promise.all([
    loadTeamAggregateInput({
      hugo_group: args.group,
      from: args.from,
      to: args.to,
    }),
    loadRoster(args.group),
  ]);
  const report = aggregateWeightRoomReport(input);
  const overview = buildWeightRoomOverview(report, roster);

  // Attendance: both sessions vs one session (relative to this week's session dates)
  const sessionDates = report.sessionDates;
  const expectedSessions = sessionDates.length;
  const bothSessions: AttendanceSplit[] = [];
  const oneSession: AttendanceSplit[] = [];

  for (const athlete of report.athletes) {
    const dates = athlete.byDate.map((d) => d.session_date).sort();
    const row: AttendanceSplit = {
      athlete_id: athlete.athlete_id,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      dates,
    };
    if (expectedSessions >= 2 && dates.length >= expectedSessions) {
      bothSessions.push(row);
    } else if (dates.length > 0) {
      oneSession.push(row);
    }
  }

  // Metric marks from Speed Journal entries (any origin) for tracked keys
  async function loadMetricMarks(
    from: string,
    to: string
  ): Promise<MetricMark[]> {
    if (metricKeys.length === 0) return [];
    const { rows } = await sql`
      SELECT
        e.athlete_id,
        a.first_name,
        a.last_name,
        e.metric_key,
        e.component,
        e.value,
        e.units,
        s.session_date
      FROM entries e
      INNER JOIN sessions s ON s.id = e.session_id
      INNER JOIN athletes a ON a.id = e.athlete_id
      WHERE s.session_date BETWEEN ${from}::date AND ${to}::date
        AND e.metric_key = ANY(${metricKeys as unknown as string}::text[])
        AND (
          EXISTS (
            SELECT 1
            FROM athlete_hugo_memberships m
            WHERE m.athlete_id = a.id AND m.hugo_group = ${args.group}
          )
          OR a.hugo_group = ${args.group}
        )
      ORDER BY a.last_name, a.first_name, s.session_date
    `;
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      athlete_id: String(row.athlete_id),
      first_name: String(row.first_name ?? ""),
      last_name: String(row.last_name ?? ""),
      metric_key: String(row.metric_key ?? ""),
      component: row.component == null ? null : String(row.component),
      value: Number(row.value),
      units: String(row.units ?? ""),
      session_date: serializeDate(row.session_date),
    }));
  }

  const baselineFrom = args.baseline ?? args.from;
  const baselineTo = args.baseline ?? args.from;

  const [thisMarks, priorMarks, baselineMarks] = await Promise.all([
    loadMetricMarks(args.from, args.to),
    loadMetricMarks(prior.from, prior.to),
    args.baseline
      ? loadMetricMarks(baselineFrom, baselineTo)
      : Promise.resolve([] as MetricMark[]),
  ]);

  // Also fold CMJ / Vertical Jump style outputs from weight-room overview into this-week marks
  // when no journal entry exists for that athlete+metric.
  const journalAthleteMetric = new Set(
    thisMarks.map((m) => `${m.athlete_id}::${m.metric_key}`)
  );
  for (const group of overview.outputGroups) {
    const label = group.label.toLowerCase();
    let mappedKey: string | null = null;
    if (label.includes("cmj") || label.includes("vertical")) {
      mappedKey = "Vertical Jump";
    } else if (label.includes("rsi") || label.includes("10-5")) {
      mappedKey = "10-5_RSI";
    } else if (label.includes("5-10-5") || label.includes("agility")) {
      mappedKey = "5-10-5_Agility";
    }
    if (!mappedKey || !metricKeys.includes(mappedKey)) continue;
    for (const row of group.rows) {
      if (row.load == null) continue;
      const key = `${row.athlete_id}::${mappedKey}`;
      if (journalAthleteMetric.has(key)) continue;
      thisMarks.push({
        athlete_id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        metric_key: mappedKey,
        component: null,
        value: row.load,
        units: row.units ?? group.units ?? "",
        session_date: row.session_date,
      });
      journalAthleteMetric.add(key);
    }
  }

  function bestByAthleteMetric(
    marks: MetricMark[]
  ): Map<string, MetricMark> {
    const byKey = new Map<string, MetricMark[]>();
    for (const m of marks) {
      if (!Number.isFinite(m.value)) continue;
      const k = `${m.athlete_id}::${m.metric_key}`;
      const list = byKey.get(k);
      if (list) list.push(m);
      else byKey.set(k, [m]);
    }
    const best = new Map<string, MetricMark>();
    for (const [k, list] of byKey) {
      const units = list[0]?.units ?? "";
      const picked = pickBest(list, isHigherBetter(units));
      if (picked) best.set(k, picked);
    }
    return best;
  }

  const thisBest = bestByAthleteMetric(thisMarks);
  const priorBest = bestByAthleteMetric(priorMarks);
  const baselineBest = bestByAthleteMetric(baselineMarks);

  const athleteIds = new Set<string>();
  for (const m of [...thisBest.values(), ...priorBest.values(), ...baselineBest.values()]) {
    athleteIds.add(m.athlete_id);
  }

  const nameById = new Map<string, NamedAthlete>();
  for (const a of roster) {
    nameById.set(a.id, {
      athlete_id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
    });
  }
  for (const m of [...thisMarks, ...priorMarks, ...baselineMarks]) {
    if (!nameById.has(m.athlete_id)) {
      nameById.set(m.athlete_id, {
        athlete_id: m.athlete_id,
        first_name: m.first_name,
        last_name: m.last_name,
      });
    }
  }

  const metrics: AthleteMetricRow[] = [];
  for (const athleteId of athleteIds) {
    const name = nameById.get(athleteId) ?? {
      athlete_id: athleteId,
      first_name: "",
      last_name: "",
    };
    for (const metricKey of metricKeys) {
      const k = `${athleteId}::${metricKey}`;
      const tw = thisBest.get(k) ?? null;
      const pw = priorBest.get(k) ?? null;
      const bl = baselineBest.get(k) ?? null;
      if (!tw && !pw && !bl) continue;
      const units = tw?.units ?? pw?.units ?? bl?.units ?? null;
      metrics.push({
        athlete_id: athleteId,
        first_name: name.first_name,
        last_name: name.last_name,
        metric_key: metricKey,
        units,
        this_week: tw?.value ?? null,
        this_week_date: tw?.session_date ?? null,
        prior_week: pw?.value ?? null,
        prior_week_date: pw?.session_date ?? null,
        baseline: bl?.value ?? null,
        baseline_date: bl?.session_date ?? null,
        pct_vs_prior: round1(pctDelta(tw?.value ?? null, pw?.value ?? null)),
        pct_vs_baseline: round1(pctDelta(tw?.value ?? null, bl?.value ?? null)),
      });
    }
  }
  sortByName(metrics);

  // Team summary for headline metrics (athletes with this-week + baseline)
  const metricSummaries = metricKeys.map((metric_key) => {
    const rows = metrics.filter(
      (m) => m.metric_key === metric_key && m.this_week != null
    );
    const withBaseline = rows.filter((m) => m.pct_vs_baseline != null);
    const avgPctVsBaseline =
      withBaseline.length > 0
        ? round1(
            withBaseline.reduce((s, m) => s + (m.pct_vs_baseline as number), 0) /
              withBaseline.length
          )
        : null;
    const majorityUnder10 =
      withBaseline.length > 0 &&
      withBaseline.filter((m) => (m.pct_vs_baseline as number) <= -10).length >
        withBaseline.length / 2;

    return {
      metric_key,
      athletes_with_mark: rows.length,
      athletes_with_baseline_delta: withBaseline.length,
      avg_pct_vs_baseline: avgPctVsBaseline,
      majority_ge_10pct_under_baseline: majorityUnder10,
      rows: sortByName(rows),
    };
  });

  const brief = {
    hugo_group: args.group,
    from: args.from,
    to: args.to,
    baseline_date: args.baseline,
    prior_week: prior,
    sessionDates,
    attendanceByDate: overview.attendanceByDate,
    rosterCount: overview.rosterCount,
    attendanceCount: overview.attendanceCount,
    bothSessions: sortByName(bothSessions).map((a) => ({
      ...a,
      name: displayName(a),
    })),
    oneSession: sortByName(oneSession).map((a) => ({
      ...a,
      name: displayName(a),
    })),
    noShows: sortByName(overview.noShows).map((a) => ({
      athlete_id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
      name: displayName(a),
    })),
    outputGroups: overview.outputGroups,
    metrics,
    metricSummaries,
  };

  console.log(JSON.stringify(brief, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
