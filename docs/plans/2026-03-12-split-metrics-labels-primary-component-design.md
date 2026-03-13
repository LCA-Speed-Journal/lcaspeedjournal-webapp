# Split Metrics: Composite Labels and Primary-Component Aggregation — Design

**Date:** 2026-03-12  
**Status:** Validated  
**Scope:** (1) Entries table and edit modal show composite labels so split components (e.g. 0-5m, 0-20m) are distinguishable. (2) Team Overview, Athlete PRs, Progression, and Flags compute "best" for cumulative metrics using only the primary (full-run) component so ranked values are full-run times, not segment times.

---

## 1. Scope and success criteria

**Scope**

- **Entries table (Edit Session):** The "Metric" column and edit modal title show a composite label so 20m_Accel-derived rows are distinguishable (e.g. "20m_Accel (0-5m)", "20m_Accel (5-10m)", or friendlier "5m Accel", "10m Accel", "20m Accel" for cumulative segments). Optional: show time in seconds for velocity metrics (e.g. 5-10m_Split, 10-20m_Split) in the same cell or tooltip.
- **Team Overview, Athlete PRs, Progression, Flags:** For metrics that have a primary (full-run) component, "best" is computed only from entries where `component` equals that primary (e.g. 20m_Accel → only "0-20m"). Metrics without components, or without a defined primary, behave as today (aggregate over all rows for that `metric_key`).

**Success criteria**

- In the entries table, no two rows that represent different intervals (e.g. 0-5m vs 0-20m) are labeled identically.
- Team Overview "team PR leaders" and athlete PRs for 20m_Accel (and similar cumulative metrics) show the best **full-run** time (e.g. best 0-20m), not the minimum over segments.
- Progression and Flags use the same rule: best per session/metric is the best for the primary component when one exists.
- No schema or API contract changes; existing clients continue to work.

**Out of scope**

- Changing how the live leaderboard works (it already filters by component).
- Adding a `pr_component` override in `metrics.json` unless an edge case appears later.

---

## 2. Architecture and components

**Approach:** Shared helper module plus minimal, per-API aggregation changes (no central "best value" service). Table labels first, then primary-component filtering in the four APIs.

**Helper module: `src/lib/metric-utils.ts`**

- **`getPrimaryComponent(metricKey: string, registry?: MetricRegistry): string | null`**
  - Reads metric definition from the registry (or `getMetricsRegistry()` from parser if none passed).
  - If `input_structure !== "cumulative"` or `default_splits` is missing/empty, returns `null`.
  - Otherwise sums `default_splits` (numeric only), builds `"0-{total}m"` (e.g. 20m_Accel → `"0-20m"`), and returns it.
  - No DB or session data; purely metric config. Registry type matches parser's `getMetricsRegistry()` shape.

- **`formatEntryMetricLabel(row: { metric_key: string; component: string | null }, registry?: MetricRegistry): string`**
  - If `row.component` is null/empty, returns `row.metric_key` (or registry `display_name` if preferred).
  - Otherwise returns a composite label. Options: (a) **Simple:** `"${metric_key} (${component})"` e.g. `"20m_Accel (0-5m)"`; (b) **Friendlier for cumulative:** If the metric is cumulative and component is a single-gate cumulative (e.g. `0-5m`, `0-10m`, `0-20m`), map to short form like "5m Accel", "10m Accel", "20m Accel"; otherwise use the simple form. For `*_Split` metrics, keep simple form.
  - Implementation can start with (a) and add (b) if desired.

**Usage**

- **EditSessionClient:** Import `formatEntryMetricLabel` and the metrics registry. In the entries table, Metric column: render `formatEntryMetricLabel(row, registry)` instead of `row.metric_key`. In the edit modal title: same helper. Optional: for rows where `metric_key` ends with `_Split` and `units === "mph"`, show `value` (time in s) as secondary text or tooltip.
- **APIs (team-overview, athletes/[id]/prs, progression, athletes/[id]/flags):** Import `getPrimaryComponent` and the registry. When aggregating "best" per metric (MIN or MAX of `display_value`), for each metric_key: if `primary = getPrimaryComponent(metric_key)` is not null, restrict to entries where `component = primary` (or `component IS NULL` for legacy rows). Prefer doing this in SQL where practical so aggregation stays in the DB.

**Dependencies**

- `metric-utils` depends only on the metric registry shape (and optionally parser for `getMetricsRegistry()`). No DB or React. Parser and `metrics.json` stay as-is; no new dependency cycle.

---

## 3. Data flow and API changes

**Team Overview (`src/app/api/team-overview/route.ts`)**

- Current: one query `SELECT e.athlete_id, e.metric_key, MIN(e.display_value), MAX(e.display_value), MAX(e.units) FROM entries e WHERE e.athlete_id = ANY($ids) GROUP BY e.athlete_id, e.metric_key`, which mixes all components.
- Change (Option A — recommended): Fetch `e.athlete_id, e.metric_key, e.component, e.display_value, e.units` for the same WHERE (no GROUP BY). In JS: build a set of (metric_key, primary_component) for metrics where `getPrimaryComponent(metric_key)` is not null. For each (athlete_id, metric_key), if the metric has a primary component, keep only rows with that component (or component null for legacy); else keep all. Then compute min/max per (athlete_id, metric_key) and derive "best per metric" and team PR leaders as today. Same "lower_is_better" (units === "s") and velocity handling as today.

**Athlete PRs (`src/app/api/athletes/[id]/prs/route.ts`)**

- Current: `SELECT metric_key, MIN(display_value), MAX(display_value), MAX(units) FROM entries WHERE athlete_id = $id GROUP BY metric_key`.
- Change: One query `SELECT metric_key, component, display_value, units FROM entries WHERE athlete_id = $id`. In JS, group by metric_key, apply primary-component filter where applicable (keep rows where component === primary or component == null for that metric), then take min/max per metric_key.

**Progression (`src/app/api/progression/route.ts`)**

- Current: Best per session per athlete for one metric with `WHERE e.metric_key = $metric` and `GROUP BY session_date, athlete_id` with MIN/MAX(display_value).
- Change: When the chosen metric has a primary component, add `AND (e.component = $primary OR e.component IS NULL)` so only the full-run component (and legacy null-component rows) contribute. If the metric has no primary component, leave the query unchanged. Use `getPrimaryComponent(metric)` once; if non-null, pass `primary` as a bound parameter. Same for the team_avg path.

**Flags (`src/app/api/athletes/[id]/flags/route.ts`)**

- Recent-entries query groups by `session_date, metric_key` and uses MIN/MAX(display_value). Apply the same rule: when building "best" per (session, metric_key), restrict to rows where `component = getPrimaryComponent(metric_key)` (or component null) when that is not null. Easiest: fetch rows with `component`, then in JS when aggregating by session_date and metric_key, filter to primary component first, then min/max. No change to how flags are created or stored.

---

## 4. Error handling and edge cases

**Helper**

- **Unknown metric_key:** `getPrimaryComponent` returns `null`. `formatEntryMetricLabel` falls back to `row.metric_key` or `metric_key (component)` when component is set.
- **Malformed config:** If `default_splits` is present but not an array of numbers (e.g. "L"/"R" for paired_components), sum only numeric elements; if sum is 0 or there are no numbers, return `null`.
- **Missing registry:** Prefer returning null / safe fallback so callers do not crash; log in development if needed.

**APIs**

- **Legacy or null component:** When filtering to primary component, treat "primary" as "primary OR null" so old data still counts: keep rows where `component === primary || component == null` for that metric.
- **Session overrides:** Primary component is derived from the **registry** `default_splits`, not session `day_splits`. So primary is always e.g. "0-20m" for 20m_Accel. Custom session gates still produce components like "0-15m", which will not match "0-20m", so those rows do not contribute to "best" for 20m_Accel. Optional later: `pr_component` override in metrics.json.
- **Empty result set:** After applying the primary-component filter, an athlete may have no rows for a metric; APIs already handle "no rows" (no PR, no team leader).

**Edit Session table**

- Missing or null component: `formatEntryMetricLabel` already handles null/empty component by showing only `metric_key`.

---

## 5. Testing and implementation order

**Testing**

- **`lib/metric-utils.ts` (unit):** `getPrimaryComponent("20m_Accel")` → `"0-20m"`; `getPrimaryComponent("10m_Accel")` → `"0-10m"`; `getPrimaryComponent("5m_Accel")` → `null`; `getPrimaryComponent("Unknown_Metric")` → `null`; `getPrimaryComponent("40m_Sprint")` → `"0-40m"`. Metric with `default_splits` non-numeric or `[]` → `null`. `formatEntryMetricLabel` with/without component, with/without registry; optional friendlier cumulative labels.
- **EditSessionClient (manual or component test):** Session with 20m_Accel (multiple components) and a velocity split; confirm Metric column shows distinct labels and edit modal title matches. Optional: velocity row shows time (s) in tooltip or secondary text.
- **APIs (integration or manual):** Same athlete has 20m_Accel rows for 0-5m, 0-10m, 0-20m, 5-10m, 10-20m. Team Overview and Athlete PRs: 20m_Accel "best" must be the 0-20m value. Progression: 20m_Accel best per session must be 0-20m only. Flags: same for "recent" values.
- **Regression:** Single-component metrics (e.g. Vertical Jump, 100m): Team Overview, PRs, Progression, Flags unchanged. Live leaderboard unchanged.

**Implementation order**

1. Add `src/lib/metric-utils.ts` with `getPrimaryComponent` and `formatEntryMetricLabel`; add unit tests; no callers yet.
2. **Entries table labels:** In EditSessionClient, use `formatEntryMetricLabel` for the Metric column and edit modal title; optional: show time (s) for velocity splits. Verify in UI.
3. **Primary-component in APIs:** In order: (a) Athlete PRs (one query + JS filter), (b) Team Overview (same pattern), (c) Progression (add component filter to existing query), (d) Flags (include component, filter in JS). After each, hit the endpoint and confirm 20m_Accel "best" is full-run.
4. Document and commit (this file).

---

## 6. Files to touch

| Area | File |
|------|------|
| Helper | `src/lib/metric-utils.ts` (new) |
| Table labels | `src/app/data-entry/session/[id]/EditSessionClient.tsx` |
| Primary component | `src/app/api/team-overview/route.ts` |
| | `src/app/api/athletes/[id]/prs/route.ts` |
| | `src/app/api/progression/route.ts` |
| | `src/app/api/athletes/[id]/flags/route.ts` |
| Tests | Unit tests for `metric-utils` (e.g. `src/lib/metric-utils.test.ts`) |

No changes to `src/lib/parser.ts`, `src/lib/metrics.json`, or the entries API schema.
