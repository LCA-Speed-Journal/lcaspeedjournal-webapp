# Reporting (Export + In-App Summary) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship public `GET /api/reporting/export` (CSV) and `GET /api/reporting/summary` (JSON) filtered by calendar `from`/`to`, plus a `/reporting` page with team overview, athlete drill-down, and CSV download—per [2026-03-21-reporting-design.md](./2026-03-21-reporting-design.md).

**Architecture:** Reuse `@vercel/postgres` `sql` tagged templates (see `src/app/api/leaderboard/historical/route.ts`) for `entries` ⨝ `sessions` ⨝ `athletes` with `s.session_date BETWEEN from AND to`. Pure TypeScript modules hold date validation, CSV escaping, and response shaping; route handlers stay thin. UI mirrors `HistoricalClient` patterns (SWR, date state, loading/error).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, SWR, Vitest, PostgreSQL (Vercel Postgres).

**Prerequisite:** Run in a dedicated git worktree if the repo is dirty—see @brainstorming / @using-git-worktrees.

---

## Reference: existing code to mirror

| Concern | File |
|--------|------|
| Date-range + session join | `src/app/api/leaderboard/historical/route.ts` (lines 134–140, 158–165) |
| Entry columns | `src/app/api/entries/route.ts` (lines 24–31) |
| Metric labels | `getMetricsRegistry()` in `src/lib/parser.ts` |
| Client: dates + fetch | `src/app/historical/HistoricalClient.tsx` (`defaultFrom`/`defaultTo`, SWR `fetcher`) |
| Schema | `scripts/migrate.sql` (`sessions.session_date`, `sessions.phase`, `entries.*`) |
| Home links | `src/app/page.tsx` (View section) |

**Route name:** use **`/reporting`** (matches design primary; avoid duplicating `/reports`).

---

## Constants (single source)

Add in `src/lib/reporting-constants.ts` (or co-locate in `reporting-date-range.ts`):

- `MAX_REPORTING_RANGE_MONTHS = 24` (reject wider ranges with 400).
- `MAX_EXPORT_ROWS = 200_000` (tune after `COUNT`; return 413 or 400 with `error` text per design).

---

### Task 1: `reporting-date-range` validation (TDD)

**Files:**

- Create: `src/lib/reporting-date-range.ts`
- Create: `src/lib/reporting-date-range.test.ts`

**Step 1: Write failing tests**

Cover: missing `from`/`to`; invalid date strings; `from > to`; range spanning more than `MAX_REPORTING_RANGE_MONTHS`; happy path returns normalized `{ from: string, to: string }` (ISO `YYYY-MM-DD`).

```typescript
// Example assertions (adjust to exported API)
import { describe, it, expect } from "vitest";
import { parseReportingDateRange } from "./reporting-date-range";

it("rejects when from > to", () => {
  const r = parseReportingDateRange({ from: "2025-01-10", to: "2025-01-01" });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.status).toBe(400);
});
```

**Step 2: Run tests (expect failures)**

Run: `npm test -- src/lib/reporting-date-range.test.ts`  
Expected: FAIL (module or function missing).

**Step 3: Implement**

- Parse with `Date` or regex + calendar math; avoid mutating shared `Date` bugs (use UTC midday trick or a small date lib only if already in project—**YAGNI**: stick to `Date` UTC date-only parsing).
- Return `Result` style: `{ ok: true, from, to } | { ok: false, status: 400, error: string }`.

**Step 4: Run tests (expect pass)**

Run: `npm test -- src/lib/reporting-date-range.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/reporting-date-range.ts src/lib/reporting-date-range.test.ts
git commit -m "feat(reporting): validate calendar date range for APIs"
```

---

### Task 2: CSV cell escaping (TDD)

**Files:**

- Create: `src/lib/csv-escape.ts`
- Create: `src/lib/csv-escape.test.ts`

**Step 1: Write failing tests**

- Plain string unchanged (no quotes).
- Comma, quote, newline in field → RFC-style double-quote escaping.
- `raw_input` containing `"""` and commas (mirror design).

**Step 2: Run tests**

Run: `npm test -- src/lib/csv-escape.test.ts`  
Expected: FAIL.

**Step 3: Implement `escapeCsvCell(value: string | number | null | undefined): string`**

- Coerce to string; empty → `""`.
- If field needs quoting, wrap in `"` and double internal `"`.

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/csv-escape.ts src/lib/csv-escape.test.ts
git commit -m "feat(reporting): RFC CSV field escaping for export"
```

---

### Task 3: `GET /api/reporting/export` — count guard + CSV body

**Files:**

- Create: `src/app/api/reporting/export/route.ts`
- Modify: `src/lib/reporting-date-range.ts` (only if re-export or shared helpers needed)

**Step 1: Write route behavior (manual or unit)**

Vitest does not yet mock DB in this repo; **minimum:** add a small **integration** test only if you introduce `sql` mocking—or document manual verification in Task 3 Step 4. **Required for this task:** unit tests already cover validation + CSV; export route **must** call `parseReportingDateRange` and return 400 on failure.

**Step 2: Implement `GET`**

1. Read `from`, `to` from `searchParams`; run `parseReportingDateRange`. On failure: `NextResponse.json({ error }, { status })`.
2. `COUNT(*)`:

```sql
SELECT COUNT(*)::int AS c
FROM entries e
INNER JOIN sessions s ON s.id = e.session_id
WHERE s.session_date >= $from::date AND s.session_date <= $to::date
```

3. If `c > MAX_EXPORT_ROWS`: return **413** (or 400 per product preference—pick one and document in handler comment) with JSON `{ error: "..." }`.
4. Else `SELECT` full row set with **same join**, **ORDER BY**  
   `s.session_date, a.last_name, a.first_name, e.metric_key, e.interval_index NULLS LAST, e.component NULLS LAST`.

   Select columns matching design:  
   `s.session_date`, `s.id AS session_id`, `s.phase`,  
   `a.id AS athlete_id`, `a.first_name`, `a.last_name`, `a.gender`, `a.athlete_type`,  
   `e.metric_key`, `e.interval_index`, `e.component`, `e.value`, `e.display_value`, `e.units`, `e.raw_input`, `e.id AS entry_id`, `e.created_at`.

5. After query: `getMetricsRegistry()`; for each row set `metric_label = registry[metric_key]?.display_name ?? metric_key`.
6. Build CSV string: header row **always** (even zero data rows), UTF-8, `\n` line endings.
7. Return:

```typescript
return new NextResponse(csvBody, {
  status: 200,
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="lcaspeed-export_${from}_${to}.csv"`,
  },
});
```

**Step 3: Slow query logging**

If elapsed &gt; 2000 ms, `console.warn` with route name and `from`/`to` (no PII beyond dates).

**Step 4: Verify manually**

Run: `npm run dev`  
curl: `curl -sI "http://localhost:3000/api/reporting/export?from=2025-01-01&to=2025-12-31"`  
Expected: `200`, `Content-Type: text/csv`, attachment filename present. Invalid range: `400` JSON.

**Step 5: Commit**

```bash
git add src/app/api/reporting/export/route.ts
git commit -m "feat(api): CSV export for reporting date range"
```

---

### Task 4: `GET /api/reporting/summary` — JSON aggregates

**Files:**

- Create: `src/app/api/reporting/summary/route.ts`
- Optional: `src/types/reporting.ts` for response types

**Step 1: Define JSON shape (implement to match)**

Suggested `data` payload:

```typescript
type MetricAgg = {
  metric_key: string;
  metric_label: string;
  n: number;
  min: number;
  max: number;
  avg: number;
  median: number;
};

type AthleteSummary = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  athlete_type: string;
  entry_count: number;
  session_count: number;
  metrics: MetricAgg[];
};

type SummaryResponse = {
  data: {
    from: string;
    to: string;
    team: {
      session_count: number;
      athlete_count: number;
      entry_count: number;
      metrics: MetricAgg[];
    };
    athletes: AthleteSummary[];
  };
};
```

**Step 2: SQL strategy (parameterized only)**

- Base filter CTE `filtered` = rows from `entries` ⨝ `sessions` ⨝ `athletes` with date range (same as export).
- **Team metrics:** `GROUP BY e.metric_key` with `COUNT(*)`, `MIN(display_value)`, `MAX(display_value)`, `AVG(display_value)`, `percentile_cont(0.5) WITHIN GROUP (ORDER BY display_value)` as median.
- **Team counts:** `COUNT(DISTINCT s.id)`, `COUNT(DISTINCT e.athlete_id)`, `COUNT(*)`.
- **Per athlete:** `GROUP BY e.athlete_id, e.metric_key` with same aggregates; separate query or second CTE for per-athlete `entry_count` / `COUNT(DISTINCT session_id)` (can be done with window functions or subqueries).

Apply `getMetricsRegistry()` for `metric_label` on the server after fetch if simpler than SQL joins to a static map.

**Step 3: Validation**

Reuse `parseReportingDateRange`; same 400 behavior as export.

**Step 4: Manual verify**

Run: `curl -s "http://localhost:3000/api/reporting/summary?from=2025-01-01&to=2025-01-31" | jq .`  
Expected: JSON with `data.team` and `data.athletes` arrays.

**Step 5: Commit**

```bash
git add src/app/api/reporting/summary/route.ts src/types/reporting.ts
git commit -m "feat(api): reporting summary JSON for date range"
```

---

### Task 5: Database indexes (if `EXPLAIN` shows seq scans)

**Files:**

- Create: `scripts/migrate-reporting-indexes.sql` (or append to a new migration script)

**Step 1:** Run `EXPLAIN (ANALYZE, BUFFERS)` on export and summary queries against staging/prod-like data.

**Step 2:** If needed, add:

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_session_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_entries_session_id ON entries(session_id);
```

(`idx_entries_session_metric_value` may already help; add `session_date` index if sessions filter is hot.)

**Step 3:** Commit migration script.

---

### Task 6: `/reporting` page + client

**Files:**

- Create: `src/app/reporting/page.tsx`
- Create: `src/app/reporting/ReportingClient.tsx`

**Step 1: Server page**

Thin wrapper: `export default function ReportingPage() { return <ReportingClient />; }` (same pattern as `src/app/historical/page.tsx`).

**Step 2: `ReportingClient`**

- State: `from`, `to` — defaults copy `defaultFrom` / `defaultTo` from `HistoricalClient.tsx` (lines 31–38) or import shared helpers if you extract them to `src/lib/reporting-default-dates.ts` (**DRY** if duplicated third time).
- SWR: `summaryUrl = /api/reporting/summary?from=&to=` when both valid.
- **Download CSV:** `window.location.href` or `fetch` + blob + `<a download>` — **do not** store CSV in React state (per design). Example:

```typescript
function downloadExport(from: string, to: string) {
  const url = `/api/reporting/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

- Layout: (1) Team overview card — session_count, athlete_count, entry_count; table or list of metrics with attempts + aggregates. (2) Athletes table — sortable columns for name, entry_count, session_count; row expand or select to show `metrics` for that athlete.
- Loading/error UI: same tone as Historical (spinner text, retry).

**Step 3: Mobile**

Wrap wide tables in `overflow-x-auto`.

**Step 4: Manual test**

Navigate to `/reporting`, change dates, confirm summary updates; click download; open CSV in Excel/Sheets.

**Step 5: Commit**

```bash
git add src/app/reporting/page.tsx src/app/reporting/ReportingClient.tsx
git commit -m "feat(ui): reporting page with summary and CSV download"
```

---

### Task 7: Navigation + smoke

**Files:**

- Modify: `src/app/page.tsx` (View section — next to Historical)
- Optional: `src/app/components/ThemeBar.tsx` — add compact "Reporting" link if you want global nav (design says "same navigation as Leaderboard / Historical"; home hub currently lists Historical under View only)

**Step 1:** Add link:

```tsx
<Link href="/reporting" className="...same as Historical...">
  Reporting
</Link>
```

**Step 2:** Run `npm run build`  
Expected: success, no TS errors.

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "chore(nav): link to reporting from home"
```

---

### Task 8: Integration test fixture (optional but valuable)

**Files:**

- Create: `src/app/api/reporting/summary.integration.test.ts` **only if** you add test DB or mock `sql`  
  **OR** document in README: seed script `npm run seed` + manual checklist.

**Minimum bar for v1:** unit tests from Tasks 1–2 + manual curl checks from Tasks 3–4.

---

## Verification checklist (before merge)

- [ ] `npm test` — all green.
- [ ] `npm run build` — passes.
- [ ] Export: headers when zero rows; UTF-8; quoted fields with commas.
- [ ] Summary medians match spreadsheet on a small known range.
- [ ] Invalid dates / inverted range / oversized range return 400 with clear `error`.
- [ ] Export over row cap returns documented error code.

---

## Execution handoff

**Plan complete and saved to `docs/plans/2026-03-21-reporting-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** — Open a new session with **executing-plans**, batch execution with checkpoints.

**Which approach?**

If **Subagent-Driven** is chosen: **REQUIRED SUB-SKILL:** @superpowers:subagent-driven-development — stay in-session, one subagent per task plus code review.

If **Parallel Session** is chosen: **REQUIRED SUB-SKILL:** @superpowers:executing-plans in the new session; use the worktree from @using-git-worktrees if applicable.
