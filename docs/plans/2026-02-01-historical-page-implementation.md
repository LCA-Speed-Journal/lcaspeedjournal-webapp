# Historical Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Historical page redesign from `docs/plans/2026-02-01-historical-page-design.md`: Max Velocity synthetic metric, bar-chart default leaderboard with Cards toggle, multi-athlete progression with gender-separated team average reference lines.

**Architecture:** API-first: (1) GET /api/metrics returns synthetic Max Velocity when mph metrics exist; (2) GET /api/leaderboard/historical supports `metric=MaxVelocity` (max display_value across all mph-metric entries in range); (3) GET /api/progression accepts multiple `athlete_id`, `metric=MaxVelocity`, and `team_avg=1` returning `series`, `team_avg_male_points`, `team_avg_female_points`. UI: Historical page uses same filters; leaderboard view toggle (Bar default, Cards); Recharts BarChart; progression multi-select (2–5 athletes), "Show team averages" checkbox, ProgressionChart with multiple lines + two dashed reference lines.

**Tech Stack:** Next.js 14+ (App Router), Vercel Postgres, Recharts, SWR, Tailwind. Existing: `getMetricsRegistry()` in `src/lib/parser.ts`, `sql` from `src/lib/db.ts`.

---

## Part A — Types and API: Max Velocity + Progression Shapes

### Task 1: Ensure LeaderboardRow and ProgressionPoint in types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add or confirm types**

Add these exports so API and UI share the same shapes (if already present, add only `source_metric_key?` to LeaderboardRow and ensure ProgressionPoint exists):

```ts
export type LeaderboardRow = {
  rank: number;
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  display_value: number;
  units: string;
  source_metric_key?: string; // optional, for Max Velocity tooltip
};

export type ProgressionPoint = {
  session_date: string;
  display_value: number;
  units?: string;
};
```

**Step 2: Run typecheck**

Run: `npm run build`
Expected: Build succeeds; no type errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add LeaderboardRow, ProgressionPoint (with optional source_metric_key)"
```

---

### Task 2: Velocity metric keys helper

**Files:**
- Create: `src/lib/velocity-metrics.ts`

**Step 1: Implement helper**

```ts
import { getMetricsRegistry } from "./parser";

const MAX_VELOCITY_KEY = "MaxVelocity";

export function getMaxVelocityKey(): string {
  return MAX_VELOCITY_KEY;
}

export function getVelocityMetricKeys(): string[] {
  const registry = getMetricsRegistry();
  return Object.entries(registry)
    .filter(([, d]) => (d.display_units ?? "").toLowerCase() === "mph")
    .map(([k]) => k);
}

export function hasVelocityMetrics(): boolean {
  return getVelocityMetricKeys().length > 0;
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: Success.

**Step 3: Commit**

```bash
git add src/lib/velocity-metrics.ts
git commit -m "feat: add velocity-metrics helper for Max Velocity"
```

---

### Task 3: GET /api/metrics — include synthetic Max Velocity when mph metrics exist

**Files:**
- Modify: `src/app/api/metrics/route.ts`

**Step 1: Read current route**

Open `src/app/api/metrics/route.ts`. It should return `{ data: { metrics: Array<{ key, display_name, display_units }> } }` (from metrics registry or similar). If file is empty or missing, create GET handler that reads registry and returns metrics list.

**Step 2: Add Max Velocity when mph exists**

- Import: `import { getMaxVelocityKey, hasVelocityMetrics } from "@/lib/velocity-metrics";`
- After building the `metrics` array from the registry, if `hasVelocityMetrics()` then append `{ key: getMaxVelocityKey(), display_name: "Max Velocity", display_units: "mph" }` to the list.
- Return the extended list.

**Step 3: Verify**

Run: `npm run build`. Call `GET /api/metrics` (e.g. `curl` or browser). Expected: When registry has mph metrics, response includes one entry with `key: "MaxVelocity"`, `display_name: "Max Velocity"`, `display_units: "mph"`.

**Step 4: Commit**

```bash
git add src/app/api/metrics/route.ts
git commit -m "feat(api): metrics list includes Max Velocity when mph metrics exist"
```

---

### Task 4: GET /api/leaderboard/historical — support metric=MaxVelocity

**Files:**
- Modify: `src/app/api/leaderboard/historical/route.ts`

**Step 1: Understand current behavior**

Current route (from design): accepts `from`, `to`, `metric`, optional `phase`, `group_by=gender`. Queries `entries` joined with `sessions` (date range, optional phase) and `athletes`; for the given metric, best value per athlete in range; returns `rows`, `male`, `female`, `units`, `metric_display_name`. Use same pattern as `src/app/api/leaderboard/route.ts` (DISTINCT ON per athlete, ORDER BY display_value DESC for non-time metrics).

**Step 2: Add Max Velocity branch**

- Import: `import { getVelocityMetricKeys, getMaxVelocityKey } from "@/lib/velocity-metrics";` and `getMetricsRegistry` from `@/lib/parser`.
- If `metric === getMaxVelocityKey()`:
  - `velocityKeys = getVelocityMetricKeys()`. If `velocityKeys.length === 0`, return 400 with message that Max Velocity is not available.
  - Query: same date/phase range, but `e.metric_key = ANY(${velocityKeys})` (or equivalent: `e.metric_key IN (...)` with parameterized list). For each athlete, take **max** `display_value` across all matching rows. Optionally select one `metric_key` that produced the max (e.g. `DISTINCT ON (e.athlete_id) ... ORDER BY e.athlete_id, e.display_value DESC`) and expose as `source_metric_key` in each row.
  - Response: same shape; `metric_display_name: "Max Velocity"`, `units: "mph"`. Optional: include `source_metric_key` on each row.
- Else: keep existing logic (single metric, existing query).

**Step 3: Verify**

Run: `npm run build`. Call `GET /api/leaderboard/historical?from=2024-01-01&to=2025-12-31&metric=MaxVelocity`. Expected: 200, ranked rows, units mph; or 400 if no mph metrics.

**Step 4: Commit**

```bash
git add src/app/api/leaderboard/historical/route.ts
git commit -m "feat(api): historical leaderboard supports metric=MaxVelocity"
```

---

### Task 5: GET /api/progression — multiple athlete_id, metric=MaxVelocity, team_avg=1

**Files:**
- Modify: `src/app/api/progression/route.ts`

**Step 1: Read current route**

Current route: accepts `athlete_id` (single), `metric`, `from`, `to`. Returns best per session/date for that athlete and metric; shape `{ data: { points, metric_display_name, units } }`.

**Step 2: Multiple athlete_id**

- Parse `athlete_id` from searchParams: support multiple (e.g. `searchParams.getAll("athlete_id")`). Cap at 8.
- If multiple ids: for each athlete, compute progression points (same logic as now). Return `{ data: { series: [{ athlete_id, first_name, last_name, points }], metric_display_name, units, team_avg_male_points?, team_avg_female_points? } }`. Single athlete: keep returning `points` at top level for backward compatibility (or document that client accepts both).

**Step 3: Metric=MaxVelocity**

- If `metric === getMaxVelocityKey()`: resolve velocity keys; for each session/date and athlete, take max `display_value` across all entries with `metric_key IN (velocityKeys)`. Same aggregation as single-metric but over multiple metric keys.

**Step 4: team_avg=1**

- If `team_avg=1`: for the same date range and metric (or Max Velocity), compute per session/date: (1) each athlete’s best for that metric (or max across mph for Max Velocity); (2) average among male athletes → `team_avg_male_points`; (3) average among female athletes → `team_avg_female_points`. Return `team_avg_male_points: ProgressionPoint[]` and `team_avg_female_points: ProgressionPoint[]` (session_date, display_value, units). If a gender has no athletes in range, return empty array for that series.

**Step 5: Verify**

Run: `npm run build`. Test: (a) `?athlete_id=id1&athlete_id=id2&metric=X&from=...&to=...` → `series` with 2 entries; (b) `?athlete_id=id1&metric=MaxVelocity&from=...&to=...` → points in mph; (c) `?athlete_id=id1&metric=X&from=...&to=...&team_avg=1` → `team_avg_male_points`, `team_avg_female_points` present.

**Step 6: Commit**

```bash
git add src/app/api/progression/route.ts
git commit -m "feat(api): progression multi-athlete, MaxVelocity, team_avg by gender"
```

---

## Part B — UI: Historical Leaderboard Bar Chart + Cards Toggle

### Task 6: Historical leaderboard view toggle and Bar chart component

**Files:**
- Create: `src/app/historical/HistoricalLeaderboardBar.tsx`
- Modify: `src/app/historical/HistoricalClient.tsx`

**Step 1: Create bar chart component**

- Component: `HistoricalLeaderboardBar({ rows, male, female, units, groupByGender, metricDisplayName })`. Use Recharts `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend` if needed. Data: when `groupByGender` use `male`/`female` for two charts (e.g. "Boys" / "Girls") or one chart with gender-colored bars; when not grouped, one bar per athlete from `rows`, color by gender (e.g. accent for M, secondary for F). X: athlete name (or short label); Y: display_value. Tooltip: athlete, value, units, rank; for Max Velocity include `source_metric_key` if present ("from [metric]"). Use CSS vars: `--accent`, `--surface`, `--foreground`. Responsive container; max height or scroll for long lists. Orientation: vertical bars (athlete on X, value on Y); design allows horizontal if desired later.

**Step 2: Add view state and toggle in HistoricalClient**

- State: `leaderboardView: "bar" | "cards"`; default `"bar"`.
- Below the "Group by gender" checkbox, add segmented control or toggle: "Bar chart" | "Cards".
- When `leaderboardView === "bar"` and `rows.length > 0`, render `<HistoricalLeaderboardBar ... />`; when `"cards"`, keep existing cards grid (current behavior). When `groupByGender` and bar view, pass `male`/`female`; otherwise pass `rows`.

**Step 3: Run build and manual check**

Run: `npm run build`. Open Historical page, select date range and metric (e.g. Max Velocity); default view is bar chart; switch to Cards and back.

**Step 4: Commit**

```bash
git add src/app/historical/HistoricalLeaderboardBar.tsx src/app/historical/HistoricalClient.tsx
git commit -m "feat(historical): bar chart default leaderboard view with Cards toggle"
```

---

## Part C — UI: Progression Multi-Athlete + Team Averages

### Task 7: Progression multi-select and team average checkbox

**Files:**
- Modify: `src/app/historical/HistoricalClient.tsx`

**Step 1: Progression athlete multi-select**

- Replace single `athleteId` with `athleteIds: string[]` (or keep single select and add multi-select; design recommends 2–5 athletes). Use a multi-select dropdown or tag input; cap at 5 (or 8). Build progression URL: `athlete_id` repeated for each id, e.g. `athleteIds.map(id => \`athlete_id=${encodeURIComponent(id)}\`).join("&")`.

**Step 2: Progression URL and SWR type**

- Progression response: accept both shapes — (a) `{ data: { points, metric_display_name, units, team_avg_male_points?, team_avg_female_points? } }` for single athlete; (b) `{ data: { series: [{ athlete_id, first_name, last_name, points }], metric_display_name, units, team_avg_male_points?, team_avg_female_points? } }` for multiple. Normalize in client: if `series` present, use it; else build single series from `points` and current athlete id/name.

**Step 3: Team average checkbox**

- State: `showTeamAvg: boolean`, default false. When true, append `&team_avg=1` to progression URL. Pass `team_avg_male_points` and `team_avg_female_points` into ProgressionChart.

**Step 4: Empty state**

- When no athlete selected or no metric: show "Select athlete(s) and metric to see progression." When 0 points and 0 team avg: "No data points in the selected range."

**Step 5: Run build and manual check**

Run: `npm run build`. Select 2 athletes, same metric, check "Show team averages"; progression chart shows multiple lines + two dashed lines.

**Step 6: Commit**

```bash
git add src/app/historical/HistoricalClient.tsx
git commit -m "feat(historical): progression multi-athlete select and team average checkbox"
```

---

### Task 8: ProgressionChart — multiple lines and team average reference lines

**Files:**
- Modify: `src/app/historical/ProgressionChart.tsx`

**Step 1: Extend props**

- Props: `series?: { athlete_id: string; first_name?: string; last_name?: string; points: ProgressionPoint[] }[]`, `points?: ProgressionPoint[]` (single-athlete backward compat), `metricDisplayName`, `units`, `teamAvgMalePoints?: ProgressionPoint[]`, `teamAvgFemalePoints?: ProgressionPoint[]`. When `series` is provided use it; else use single `points` as one series.

**Step 2: Build Recharts data**

- Build a merged data array keyed by session_date: for each date, collect value per athlete (from each series), plus `men_avg` and `women_avg` from team average points. Each row: `{ session_date, [athleteId or name]: value, men_avg?, women_avg? }`.

**Step 3: Render Line components**

- One `<Line>` per athlete (distinct color; use a small palette or hash from athlete_id). Two dashed `<Line>` for "Men's Average" and "Women's Average" (e.g. `strokeDasharray="5 5"`), distinct colors matching Boys/Girls (e.g. same as leaderboard). Legend: athlete names + "Men's Average" / "Women's Average". Tooltip: date, list of athlete values, men's avg, women's avg when present.

**Step 4: Empty state**

- If no points in any series and no team avg points, show "No data points for this selection in the selected range."

**Step 5: Run build and manual check**

Run: `npm run build`. Verify multi-athlete and team avg lines render correctly.

**Step 6: Commit**

```bash
git add src/app/historical/ProgressionChart.tsx
git commit -m "feat(historical): ProgressionChart multi-series and team avg reference lines"
```

---

## Part D — Polish and Verification

### Task 9: E2E verification and edge cases

**Files:**
- None (verification only).

**Step 1: API edge cases**

- No mph metrics: GET /api/metrics does not include Max Velocity; GET /api/leaderboard/historical?metric=MaxVelocity returns 400 or empty with clear message.
- Empty date range: historical and progression return empty rows/points without error.

**Step 2: UI edge cases**

- Max Velocity in metric dropdown only when API includes it. Leaderboard defaults to bar chart; toggle to Cards preserves data. Progression: single athlete + team avg shows one line + two dashed lines; multi-athlete + team avg shows N lines + two dashed lines. One gender no data: only the other team avg line shown.

**Step 3: Commit (if any doc or comment changes)**

```bash
git add -A
git status
# Commit only if there are changes.
git commit -m "chore: historical page redesign verification" || true
```

---

## Summary Checklist

| Item | API | UI |
|------|-----|-----|
| Max Velocity in metric list | GET /api/metrics includes synthetic Max Velocity when mph metrics exist | Dropdown shows "Max Velocity (mph)" |
| Max Velocity historical | GET /api/leaderboard/historical?metric=MaxVelocity | Same filters; rank by best mph in range; bar or cards |
| Bar chart leaderboard | No change | Default: Bar chart; toggle to Cards; Recharts BarChart; gender color |
| Multi-athlete progression | GET /api/progression?athlete_id=1&athlete_id=2&... | Multi-select athletes (cap 5–8); one line per athlete |
| Team average (by gender) | GET /api/progression?...&team_avg=1 → team_avg_male_points, team_avg_female_points | Checkbox "Show team averages"; two dashed lines |

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-01-historical-page-implementation.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — Open a new session with executing-plans in the LCA-Speed_Vercel worktree and run through the plan with checkpoints.

**Which approach do you want?**

- If **Subagent-Driven:** use @subagent-driven-development in this session.
- If **Parallel Session:** open the new session in the worktree and use @executing-plans there.
