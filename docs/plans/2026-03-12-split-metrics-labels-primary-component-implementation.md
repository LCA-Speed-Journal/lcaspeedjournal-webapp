# Split Metrics: Composite Labels and Primary-Component — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add composite labels in the entries table (Edit Session) so split components are distinguishable, and restrict "best" aggregation to the primary (full-run) component in Team Overview, Athlete PRs, Progression, and Flags so ranked values are full-run times, not segment times.

**Architecture:** New `src/lib/metric-utils.ts` exposes `getPrimaryComponent(metricKey)` (returns e.g. "0-20m" for 20m_Accel from registry) and `formatEntryMetricLabel(row, registry)` (returns composite label). EditSessionClient uses the label helper for the Metric column and edit modal. The four APIs fetch entries with `component` and, in JS, filter to primary component when defined before computing min/max; Progression adds a SQL `AND (e.component = $primary OR e.component IS NULL)` when primary exists.

**Tech Stack:** Next.js, TypeScript, Vitest, @vercel/postgres. Design: `docs/plans/2026-03-12-split-metrics-labels-primary-component-design.md`.

---

## Task 1: Add `getPrimaryComponent` with tests

**Files:**
- Create: `src/lib/metric-utils.test.ts`
- Create: `src/lib/metric-utils.ts`

**Step 1: Write the failing test**

Create `src/lib/metric-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getPrimaryComponent } from "./metric-utils";

describe("getPrimaryComponent", () => {
  it("returns 0-20m for 20m_Accel (cumulative, default_splits [5,5,10])", () => {
    expect(getPrimaryComponent("20m_Accel")).toBe("0-20m");
  });

  it("returns 0-10m for 10m_Accel (cumulative, default_splits [5,5])", () => {
    expect(getPrimaryComponent("10m_Accel")).toBe("0-10m");
  });

  it("returns null for 5m_Accel (single_interval)", () => {
    expect(getPrimaryComponent("5m_Accel")).toBeNull();
  });

  it("returns null for unknown metric", () => {
    expect(getPrimaryComponent("Unknown_Metric")).toBeNull();
  });

  it("returns 0-40m for 40m_Sprint (cumulative)", () => {
    expect(getPrimaryComponent("40m_Sprint")).toBe("0-40m");
  });

  it("returns null when default_splits has no numbers", () => {
    expect(getPrimaryComponent("5m_Accel")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/metric-utils.test.ts -v`  
Expected: FAIL (e.g. "Cannot find module './metric-utils'" or "getPrimaryComponent is not a function").

**Step 3: Write minimal implementation**

Create `src/lib/metric-utils.ts`:

```ts
import { getMetricsRegistry } from "./parser";

export type MetricRegistry = ReturnType<typeof getMetricsRegistry>;

/**
 * Returns the primary (full-run) component for a cumulative metric, e.g. "0-20m" for 20m_Accel.
 * Returns null for non-cumulative, unknown, or invalid metrics.
 */
export function getPrimaryComponent(
  metricKey: string,
  registry?: MetricRegistry
): string | null {
  const reg = registry ?? getMetricsRegistry();
  const metric = reg[metricKey];
  if (!metric || metric.input_structure !== "cumulative") return null;
  const splits = metric.default_splits;
  if (!Array.isArray(splits)) return null;
  const nums = splits.filter((s): s is number => typeof s === "number");
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return `0-${total}m`;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/metric-utils.test.ts -v`  
Expected: PASS (all 6 tests). Fix 5m_Accel expectation if needed — 5m_Accel has `default_splits: []`, so null is correct.

**Step 5: Commit**

```bash
git add src/lib/metric-utils.test.ts src/lib/metric-utils.ts
git commit -m "feat(metric-utils): add getPrimaryComponent for cumulative metrics"
```

---

## Task 2: Add `formatEntryMetricLabel` with tests

**Files:**
- Modify: `src/lib/metric-utils.test.ts` (add describe block)
- Modify: `src/lib/metric-utils.ts` (add function)

**Step 1: Write the failing test**

Append to `src/lib/metric-utils.test.ts`:

```ts
import { formatEntryMetricLabel } from "./metric-utils";

describe("formatEntryMetricLabel", () => {
  it("returns metric_key when component is null", () => {
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: null })).toBe("20m_Accel");
  });

  it("returns metric_key when component is empty string", () => {
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: "" })).toBe("20m_Accel");
  });

  it("returns composite label when component is set", () => {
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: "0-5m" })).toBe("20m_Accel (0-5m)");
    expect(formatEntryMetricLabel({ metric_key: "20m_Accel", component: "5-10m" })).toBe("20m_Accel (5-10m)");
  });

  it("handles unknown metric with component", () => {
    expect(formatEntryMetricLabel({ metric_key: "Unknown", component: "0-5m" })).toBe("Unknown (0-5m)");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/metric-utils.test.ts -v`  
Expected: FAIL (formatEntryMetricLabel is not a function or not defined).

**Step 3: Write minimal implementation**

Add to `src/lib/metric-utils.ts`:

```ts
/**
 * Returns a display label for an entry row: metric_key alone or "metric_key (component)".
 */
export function formatEntryMetricLabel(
  row: { metric_key: string; component: string | null },
  _registry?: MetricRegistry
): string {
  if (row.component != null && row.component.trim() !== "") {
    return `${row.metric_key} (${row.component})`;
  }
  return row.metric_key;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/metric-utils.test.ts -v`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/metric-utils.test.ts src/lib/metric-utils.ts
git commit -m "feat(metric-utils): add formatEntryMetricLabel for entries table"
```

---

## Task 3: Entries table and edit modal use composite label

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx` (import helper, use in table cell and edit modal title)

**Step 1: Add import and registry**

At top of `EditSessionClient.tsx`, add:

```ts
import { formatEntryMetricLabel } from "@/lib/metric-utils";
import { getMetricsRegistry } from "@/lib/parser";
```

Add near the top of the component (e.g. after fetcher), before any hooks that need it:

```ts
const metricsRegistry = getMetricsRegistry();
```

(Or use `useMemo(() => getMetricsRegistry(), [])` if you prefer not to call at top level.)

**Step 2: Use label in table Metric column**

Find the table cell that renders `{row.metric_key}` (around line 441). Replace with:

```tsx
<td className="px-3 py-2">{formatEntryMetricLabel({ metric_key: row.metric_key, component: row.component }, metricsRegistry)}</td>
```

**Step 3: Use label in edit modal title**

Find the edit modal title that shows `{editingEntry.metric_key}` (around line 504). Replace with:

```tsx
Edit entry — {editingEntry.first_name} {editingEntry.last_name}, {formatEntryMetricLabel({ metric_key: editingEntry.metric_key, component: editingEntry.component }, metricsRegistry)}
```

**Step 4: Run tests and lint**

Run: `npm run test -- -v`  
Run: `npm run lint`  
Expected: All existing tests pass; no new lint errors.

**Step 5: Commit**

```bash
git add src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat(edit-session): show composite metric labels in entries table and edit modal"
```

---

## Task 4: Athlete PRs API — filter by primary component

**Files:**
- Modify: `src/app/api/athletes/[id]/prs/route.ts`

**Step 1: Change query to include component**

Replace the existing entries query with one that selects rows without GROUP BY, so we can filter in JS:

```ts
const registry = getMetricsRegistry();
const { rows: entryRows } = await sql`
  SELECT metric_key, component, display_value, units
  FROM entries
  WHERE athlete_id = ${athleteId}
`;
```

**Step 2: Add getPrimaryComponent import**

At top: `import { getPrimaryComponent } from "@/lib/metric-utils";`

**Step 3: Aggregate in JS with primary-component filter**

Replace the loop that builds `result` from `rows` with logic that:
- Groups rows by metric_key.
- For each metric_key, if `getPrimaryComponent(metric_key)` is not null, keep only rows where `component === primary || component == null`; else keep all rows.
- For each group, compute min/max by units (s → min, else max), then push to result with display_name, units, value, lower_is_better.
- Preserve existing velocity handling (velocityKeys, maxVelKey, maxVelocityValue) by applying the same filter when considering velocity metrics.

Concrete implementation:

```ts
const registry = getMetricsRegistry();
const { rows: entryRows } = await sql`
  SELECT metric_key, component, display_value, units
  FROM entries
  WHERE athlete_id = ${athleteId}
`;

const byMetric = new Map<string, { display_value: number; units: string }[]>();
for (const r of entryRows as { metric_key: string; component: string | null; display_value: number; units: string }[]) {
  const primary = getPrimaryComponent(r.metric_key, registry);
  const keep = primary == null || r.component === primary || r.component == null;
  if (!keep) continue;
  const list = byMetric.get(r.metric_key) ?? [];
  list.push({ display_value: Number(r.display_value), units: r.units });
  byMetric.set(r.metric_key, list);
}

const result: { metric_key: string; display_name: string; units: string; value: number; lower_is_better: boolean }[] = [];
const velocityKeys = hasVelocityMetrics() ? getVelocityMetricKeys() : [];
let maxVelocityValue: number | null = null;

for (const [metric_key, list] of byMetric) {
  if (list.length === 0) continue;
  const def = registry[metric_key];
  const units = (def?.display_units ?? list[0].units ?? "").toLowerCase();
  const lowerIsBetter = units === "s";
  const values = list.map((x) => x.display_value);
  const value = lowerIsBetter ? Math.min(...values) : Math.max(...values);

  if (velocityKeys.includes(metric_key)) {
    const v = Math.max(...values);
    if (maxVelocityValue === null || v > maxVelocityValue) maxVelocityValue = v;
  }

  result.push({
    metric_key,
    display_name: def?.display_name ?? metric_key,
    units: def?.display_units ?? list[0].units ?? "",
    value,
    lower_is_better: lowerIsBetter,
  });
}
```

Then keep the existing MaxVelocity push and sort. Remove the old `for (const r of rows...)` loop and the old `rows` variable.

**Step 4: Run tests and lint**

Run: `npm run test -- -v`  
Run: `npm run lint`  
Expected: Pass. Manually: GET /api/athletes/[id]/prs for an athlete with 20m_Accel entries; 20m_Accel value should be the 0-20m time, not the min of all components.

**Step 5: Commit**

```bash
git add src/app/api/athletes/[id]/prs/route.ts
git commit -m "fix(prs): use primary component for cumulative metrics best value"
```

---

## Task 5: Team Overview API — filter by primary component

**Files:**
- Modify: `src/app/api/team-overview/route.ts`

**Step 1: Change entries query to include component**

Replace the query that does `GROUP BY e.athlete_id, e.metric_key` with:

```ts
const entriesRows = await sql`
  SELECT e.athlete_id, e.metric_key, e.component, e.display_value, e.units
  FROM entries e
  WHERE e.athlete_id = ANY(${ids as unknown as string})
`;
```

**Step 2: Add getPrimaryComponent import**

At top: `import { getPrimaryComponent } from "@/lib/metric-utils";`

**Step 3: Filter by primary and aggregate in JS**

Replace the `entries` type and the `for (const r of entries)` loop. Build a map keyed by (athlete_id, metric_key) of arrays of { display_value, units }. When building each array, for each row: if getPrimaryComponent(r.metric_key) is not null, keep only rows where component === primary || component == null; else keep all. Then compute min_val/max_val per (athlete_id, metric_key) and feed the same structure into the existing byMetric / teamPrLeaders logic (so for each (athlete_id, metric_key) you have one min and one max; then for each metric_key you pick the best across athletes using lowerIsBetter).

Concrete approach: iterate raw rows; for each row, if metric has primary component and row.component is not null and row.component !== primary, skip. Else add row to a list keyed by (athlete_id, metric_key). Then for each (athlete_id, metric_key), compute min/max display_value; then run the existing byMetric logic that picks best athlete per metric.

```ts
const entries = entriesRows.rows as {
  athlete_id: string;
  metric_key: string;
  component: string | null;
  display_value: number;
  units: string;
}[];

const byAthleteMetric = new Map<string, { min_val: number; max_val: number; units: string }>();
function key(aid: string, mk: string) {
  return `${aid}\t${mk}`;
}
for (const r of entries) {
  const primary = getPrimaryComponent(r.metric_key, registry);
  if (primary != null && r.component != null && r.component !== primary) continue;
  const k = key(r.athlete_id, r.metric_key);
  const cur = byAthleteMetric.get(k);
  const val = Number(r.display_value);
  const units = r.units ?? "";
  if (!cur) {
    byAthleteMetric.set(k, { min_val: val, max_val: val, units });
  } else {
    byAthleteMetric.set(k, {
      min_val: Math.min(cur.min_val, val),
      max_val: Math.max(cur.max_val, val),
      units: units || cur.units,
    });
  }
}
```

Then build `entries`-like array from byAthleteMetric for the rest of the function:

```ts
const entriesForByMetric = Array.from(byAthleteMetric.entries()).map(([k, v]) => {
  const [athlete_id, metric_key] = k.split("\t");
  return { athlete_id, metric_key, min_val: String(v.min_val), max_val: String(v.max_val), units: v.units };
});
```

Use `entriesForByMetric` in place of `entries` in the existing `for (const r of entries)` loop that builds byMetric and teamPrLeaders.

**Step 4: Run tests and lint**

Run: `npm run test -- -v` and `npm run lint`. Manually: Team Overview page; 20m_Accel team leader should show 0-20m time.

**Step 5: Commit**

```bash
git add src/app/api/team-overview/route.ts
git commit -m "fix(team-overview): use primary component for cumulative metrics best value"
```

---

## Task 6: Progression API — filter by primary component in SQL

**Files:**
- Modify: `src/app/api/progression/route.ts`

**Step 1: Add getPrimaryComponent import**

At top: `import { getPrimaryComponent } from "@/lib/metric-utils";`

**Step 2: Add component filter to single-metric query**

In the `else` branch where the metric is not MaxVelocity (around line 112), after getting `metricDef` and before building the query: compute `const primary = getPrimaryComponent(metric, registry);`. When building the SQL string parts, add a condition: if `primary != null`, add after `e.metric_key = ` part: ` AND (e.component = ` and then a placeholder for primary, then ` OR e.component IS NULL)`; pass `primary` in the template args. So the WHERE clause becomes: session date range, metric_key = metric, athlete_id IN (...), and (component = primary OR component IS NULL). Use the tagged template or sql helper so primary is bound as a parameter (not string concatenated).

Example: if using `sql` with a raw template, add to stringParts after the metric and athlete conditions something like: ` AND (e.component = ` + (primary != null ? `$primaryParam` : `NULL`) + ` OR e.component IS NULL)`. The exact syntax depends on how the progression route builds the query (it uses stringParts and then sql(template, ...)). Check the file: it uses `sql(template, from, to, metric, ...cappedIds)`. So add one more condition and one more argument. For example, after the closing `)` of the athlete_id OR chain, push ` AND (e.component = `, then a placeholder, then ` OR e.component IS NULL)`; in the template call, if primary != null pass primary, else you need to not add the filter (so either build two code paths or pass a sentinel). Simplest: when primary != null, add ` AND (e.component = ${primary} OR e.component IS NULL)` using a bound parameter. In @vercel/postgres, parameters are positional. So extend the template array to include a part for primary and pass primary in the sql() call when non-null; when null, the condition must not restrict (e.g. add " AND (1=1)" or skip the clause). Implement: if (primary != null) { stringParts.push(" AND (e.component = ", " OR e.component IS NULL)"); } and in sql(template, ...args), when primary != null include primary in args.

**Step 3: Add component filter to team_avg single-metric path**

In the team_avg branch, the second query for a single metric (sortAsc / else) also has `WHERE e.metric_key = ${metric}`. Add the same (e.component = primary OR e.component IS NULL) when primary != null. Use the same getPrimaryComponent(metric, registry) and pass primary into the query.

**Step 4: Run tests and lint**

Run: `npm run test -- -v` and `npm run lint`. Manually: Progression for 20m_Accel; best per session should be 0-20m only.

**Step 5: Commit**

```bash
git add src/app/api/progression/route.ts
git commit -m "fix(progression): use primary component for cumulative metrics best per session"
```

---

## Task 7: Flags API — filter by primary component

**Files:**
- Modify: `src/app/api/athletes/[id]/flags/route.ts`

**Step 1: Change recent entries query to include component**

Replace the query that does `GROUP BY s.session_date, e.metric_key` with one that selects rows without grouping:

```ts
const { rows: recentRows } = await sql`
  SELECT s.session_date::text, e.metric_key, e.component, e.display_value
  FROM entries e
  INNER JOIN sessions s ON s.id = e.session_id
  WHERE e.athlete_id = ${athleteId}
    AND s.session_date >= ${fromDate.toISOString().slice(0, 10)}
  ORDER BY s.session_date ASC
`;
```

**Step 2: Add getPrimaryComponent and filter in JS**

Add at top: `import { getPrimaryComponent } from "@/lib/metric-utils";`. The route already gets the registry. Build byMetric by iterating recentRows: for each row, if getPrimaryComponent(metric_key) is not null and row.component is not null and row.component !== primary, skip; else add (session_date, value) to the list for that metric_key. Value = display_value; when building the list, for each (session_date, metric_key) you need one value per session — so group by (session_date, metric_key), and for each group keep only rows that pass the primary filter, then take min or max by units. So: group by metric_key first, then within each metric filter by primary, then group by session_date and take min/max per session. Then the rest of the declining-trend logic stays the same (byMetric.get(metricKey) is an array of { session_date, value }).

Concrete: Use registry from existing getMetricsRegistry() and getPrimaryComponent from import. For each row in recentRows, if primary = getPrimaryComponent(row.metric_key, registry), and primary != null and row.component != null and row.component !== primary, skip. Else push { session_date: row.session_date, value: Number(row.display_value) } to byMetric.get(row.metric_key). When building the list per metric, you need one value per session (best per session). So first group raw rows by (metric_key, session_date), apply primary filter, then take min or max per (metric_key, session_date), then for each metric_key you have a list of { session_date, value }. So: const byMetricSession = new Map<string, Map<string, number>>(); for each row (after primary filter), get or create Map for metric_key, then get or create Map for session_date, then set value = min or max of current and row.display_value based on units. Then convert to byMetric: Map<metric_key, { session_date, value }[]> by iterating byMetricSession and for each metric_key, [...sessions.entries()].map(([session_date, value]) => ({ session_date, value })).

**Step 3: Run tests and lint**

Run: `npm run test -- -v` and `npm run lint`. Manually: Flags for an athlete with 20m_Accel; declining trend should use 0-20m values per session.

**Step 4: Commit**

```bash
git add src/app/api/athletes/[id]/flags/route.ts
git commit -m "fix(flags): use primary component for cumulative metrics in declining trend"
```

---

## Verification

- Run full test suite: `npm run test -- -v`
- Run lint: `npm run lint`
- Manual: Edit Session with 20m_Accel entries — Metric column shows e.g. "20m_Accel (0-5m)", "20m_Accel (0-20m)". Team Overview and Athlete PRs show 20m_Accel best = full 0-20m time. Progression and Flags use 0-20m for 20m_Accel.

---

## Reference

- Design: `docs/plans/2026-03-12-split-metrics-labels-primary-component-design.md`
- Metrics registry: `src/lib/metrics.json`, `src/lib/parser.ts` (getMetricsRegistry)
- Existing tests: `src/lib/parser.test.ts`, `src/lib/leaderboard-sections.test.ts` (Vitest patterns)
