# Canonical cumulative metric keys — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store each 0→Xm cumulative sprint time under the canonical registry key (`5m_Accel`, `10m_Accel`, `30m_Accel`, …) in the parser and backfill existing `entries` rows so leaderboards, PRs, and progression compare consistently across rep lengths.

**Architecture:** Add `resolveCanonicalZeroStartRow` in `src/lib/canonical-cumulative.ts` using **`metrics.json` only** (no imports from `parser` / `metric-utils` — avoids circular imports when `parser` loads this module). Wire it in `parseCumulative` (first loop only). Backfill via a **tsx script** that imports the same module. See `docs/plans/2026-03-20-canonical-cumulative-metric-keys-design.md`.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Vitest 4, `@vercel/postgres` / Neon-style Postgres, `tsx` for scripts.

**Context:** Prefer implementing in a dedicated git worktree (@`.cursor/skills/using-git-worktrees`); repo root: `lcaspeedjournal-webapp-clean`.

---

## Prerequisites

- Read: `docs/plans/2026-03-20-canonical-cumulative-metric-keys-design.md`
- Read: `src/lib/parser.ts` (`parseCumulative`, lines ~174–298)
- Read: `src/lib/metric-utils.ts`, `src/app/api/athletes/[id]/prs/route.ts` (PR filter uses `getPrimaryComponent`)

---

### Task 1: `resolveCanonicalZeroStartRow` + unit tests (TDD)

**Files:**
- Create: `src/lib/canonical-cumulative.ts`
- Create: `src/lib/canonical-cumulative.test.ts`

**Step 1: Write failing tests**

In `src/lib/canonical-cumulative.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveCanonicalZeroStartRow } from "./canonical-cumulative";
import { getMetricsRegistry } from "./parser";

describe("resolveCanonicalZeroStartRow", () => {
  const reg = getMetricsRegistry();

  it("maps 20m_Accel + endM 5 to 5m_Accel with null component (single_interval)", () => {
    expect(resolveCanonicalZeroStartRow("20m_Accel", 5, reg)).toEqual({
      metric_key: "5m_Accel",
      component: null,
    });
  });

  it("maps 20m_Accel + endM 10 to 10m_Accel with primary 0-10m", () => {
    expect(resolveCanonicalZeroStartRow("20m_Accel", 10, reg)).toEqual({
      metric_key: "10m_Accel",
      component: "0-10m",
    });
  });

  it("maps 30m_Accel + endM 30 to 30m_Accel with primary 0-30m", () => {
    expect(resolveCanonicalZeroStartRow("30m_Accel", 30, reg)).toEqual({
      metric_key: "30m_Accel",
      component: "0-30m",
    });
  });

  it("returns null when candidate missing (50m_Sprint + 30 — no 30m_Sprint)", () => {
    expect(resolveCanonicalZeroStartRow("50m_Sprint", 30, reg)).toBeNull();
  });

  it("returns null for non-matching parent (3x200m)", () => {
    expect(resolveCanonicalZeroStartRow("3x200m", 200, reg)).toBeNull();
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
cd "c:\Users\rossp\OneDrive\Documents\Python Scripts\2026 Coding\lcaspeedjournal-webapp-clean"
npm run test -- src/lib/canonical-cumulative.test.ts
```

Expected: FAIL — module or function missing.

**Step 3: Implement `src/lib/canonical-cumulative.ts`**

**Circular import guard:** `parser.ts` will import this module. Do **not** import `parser` or `metric-utils` from `canonical-cumulative.ts` (both eventually load `parser`). Instead:

- `import metricsData from "./metrics.json"` and type the registry as `Record<string, MetricDef>` (copy the small `MetricDef` shape from `parser.ts` or use `import type` from a shared types module if one exists).
- Inline the same logic as `getPrimaryComponent` from `src/lib/metric-utils.ts` (lines 8–22) in a local `function primaryComponentForMetric(metricKey: string, registry: ...): string | null` so behavior matches PR filtering.

```ts
import metricsData from "./metrics.json";

type MetricDef = {
  input_structure: string;
  default_splits: (number | string)[];
};

export type MetricRegistry = Record<string, MetricDef>;

function primaryComponentForMetric(metricKey: string, registry: MetricRegistry): string | null {
  const metric = registry[metricKey];
  if (!metric || metric.input_structure !== "cumulative") return null;
  const nums = (metric.default_splits as number[]).filter((s) => typeof s === "number");
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return `0-${total}m`;
}

export function resolveCanonicalZeroStartRow(
  parentMetricKey: string,
  endMeters: number,
  registry: MetricRegistry
): { metric_key: string; component: string | null } | null {
  const m = parentMetricKey.match(/^(\d+)m_(.+)$/);
  if (!m) return null;
  const candidate = `${endMeters}m_${m[2]}`;
  if (!registry[candidate]) return null;
  const def = registry[candidate];
  const primary =
    def.input_structure === "cumulative"
      ? primaryComponentForMetric(candidate, registry)
      : null;
  return { metric_key: candidate, component: primary };
}
```

In `parseCumulative`, pass `getMetricsRegistry()` as `registry` (same object shape as `metrics.json` cast).

**Step 4: Run tests — expect PASS**

```bash
npm run test -- src/lib/canonical-cumulative.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/canonical-cumulative.ts src/lib/canonical-cumulative.test.ts
git commit -m "feat: resolve canonical zero-start cumulative metric key"
```

---

### Task 2: Wire resolver into `parseCumulative` (first loop)

**Files:**
- Modify: `src/lib/parser.ts` (import + first `for` loop in `parseCumulative`, ~201–215)
- Modify: `src/lib/parser.test.ts` (add `parseEntry` tests)

**Step 1: Write failing test**

Create tests in `src/lib/parser.test.ts` (extend file — currently only segment helpers are tested):

```ts
import { describe, it, expect } from "vitest";
import { parseEntry } from "./parser";

describe("parseEntry cumulative canonical keys", () => {
  it("20m_Accel with three cumulative times emits 5m_Accel, 10m_Accel, 20m_Accel rows", () => {
    const rows = parseEntry("20m_Accel", "1.0|2.0|3.0");
    const keys = rows.map((r) => r.metric_key);
    expect(keys).toContain("5m_Accel");
    expect(keys).toContain("10m_Accel");
    expect(keys).toContain("20m_Accel");
    expect(rows.filter((r) => r.metric_key === "5m_Accel")).toHaveLength(1);
    expect(rows.find((r) => r.metric_key === "5m_Accel")?.component).toBeNull();
    expect(rows.find((r) => r.metric_key === "10m_Accel")?.component).toBe("0-10m");
    expect(rows.find((r) => r.metric_key === "20m_Accel")?.component).toBe("0-20m");
  });
});
```

Use realistic times if assertions on `value` are added (optional).

**Step 2: Run test — expect FAIL**

```bash
npm run test -- src/lib/parser.test.ts -t "canonical"
```

Expected: FAIL — still `20m_Accel` on rows or import error.

**Step 3: Implement**

At the top of `parseCumulative`, add `const registry = getMetricsRegistry();` (already available via existing imports).

In the **first** `for` loop only (lines ~201–215 in `src/lib/parser.ts`):

- Import `resolveCanonicalZeroStartRow` from `./canonical-cumulative`.
- After computing `endM`, `distM`, and before `rows.push`, call:

```ts
const canonical = resolveCanonicalZeroStartRow(metric.display_name, endM, registry);
const rowMetricKey = canonical?.metric_key ?? metric.display_name;
const rowComponent = canonical?.component ?? formatIntervalLabel(0, endM);
const rowIntervalIndex = canonical ? null : i;
```

- Recompute `displayVal` with **`applyConversion(val, metric.conversion_formula, distM)`** using the **canonical** metric’s formula when `canonical` is non-null:

```ts
const convSource = canonical ? registry[rowMetricKey]! : metric;
const displayVal = applyConversion(
  val,
  convSource.conversion_formula as string,
  distM
);
```

(Adjust `applyConversion` typing if needed; keep behavior identical when `canonical` is null.)

- Push `{ metric_key: rowMetricKey, interval_index: rowIntervalIndex, component: rowComponent, ... }`.

**Do not** change the second loop (split rows) or third loop yet unless Task 3 requires it.

**Step 4: Run tests — expect PASS**

```bash
npm run test -- src/lib/parser.test.ts -t "canonical"
```

**Step 5: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts
git commit -m "feat(parser): emit canonical metric_key for 0-start cumulative rows"
```

---

### Task 3: Deduplicate overlapping rows (third loop in `parseCumulative`)

**Files:**
- Modify: `src/lib/parser.ts` (third loop ~260–296)

**Problem:** The “Additional 10m intervals” loop may emit `0–Xm`-style rows that duplicate the first loop after canonical keys (e.g. a `0–30m` interval row that should be only `30m_Accel`).

**Step 1:** Add a parser test for a metric where the third loop fires (e.g. `40m_Sprint` with splits `[20,10,10]` and realistic cumulative input) and assert **no duplicate** `{ metric_key, component, value }` for the same logical 0→Xm time.

**Step 2:** Adjust or skip third-loop iterations when `resolveCanonicalZeroStartRow(metric.display_name, endM, registry)` is non-null and identical to a row already pushed from the first loop (or skip emitting parent-key `0–Xm` rows that duplicate a canonical key).

**Step 3:** Run `npm run test -- src/lib/parser.test.ts`

**Step 4: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts
git commit -m "fix(parser): avoid duplicate canonical rows from nested interval loop"
```

---

### Task 4: Backfill script (existing `entries`)

**Files:**
- Create: `scripts/migrate-canonical-cumulative-entries.ts`
- Modify: `package.json` (optional script `"migrate:canonical": "tsx scripts/migrate-canonical-cumulative-entries.ts"`)

**Step 1:** Script loads DB via `@/lib/db` (`sql` from `src/lib/db.ts`) — use `tsx` with path alias or relative imports; if `@/` fails from `scripts/`, use relative import to `../src/lib/db`.

**Step 2:** `SELECT id, metric_key, component, interval_index FROM entries WHERE component ~ '^0-[0-9]+m$'` (Postgres: `component ~ '^0-[0-9]+m$'`).

**Step 3:** For each row, parse `endM` from `component` (`0-20m` → `20`), call `resolveCanonicalZeroStartRow(metric_key, endM, registry)` with `registry` from `getMetricsRegistry()` imported from `../src/lib/parser` (script may import `parser` — no browser bundle).

**Step 4:** If result is non-null and `(metric_key, component)` would change, `UPDATE entries SET metric_key = $1, component = $2, interval_index = NULL WHERE id = $3`.

**Step 5:** Log counts: rows examined, rows updated, skipped (null resolution or already canonical).

**Step 6:** Run against a **copy** of production data first. Wrap in transaction; document `BEGIN` / `COMMIT` in script comments.

**Step 7: Commit**

```bash
git add scripts/migrate-canonical-cumulative-entries.ts package.json
git commit -m "chore: script to backfill canonical cumulative metric keys"
```

---

### Task 5: Full verification

**Step 1:** Run full unit suite:

```bash
npm run test
```

Expected: all tests pass.

**Step 2:** Run lint:

```bash
npm run lint
```

**Step 3:** Run production build:

```bash
npm run build
```

**Step 4: Commit** only if fixes were needed for lint/build.

---

### Task 6: API / UI smoke checks (manual or follow-up)

**No code change required** if canonical `component` values align with `getPrimaryComponent` for each key:

- `GET /api/athletes/[id]/prs` — `src/app/api/athletes/[id]/prs/route.ts` — should show `5m_Accel`, `10m_Accel` PRs after backfill.
- `GET /api/progression` — `src/app/api/progression/route.ts` — already filters cumulative metrics by `metric_key` + `component = primary`; canonical rows match this.
- `GET /api/leaderboard/session-metrics` — `src/app/api/leaderboard/session-metrics/route.ts` — will list separate `metric_key`s per session (expected).
- `LeaderboardClient` — `src/app/leaderboard/LeaderboardClient.tsx` — session metric picker should show `5m_Accel` as its own expandable metric when entries exist.

**Step 1:** After backfill, hit session-metrics + leaderboard for one session in the browser.

**Step 2:** Update `docs/plans/2026-03-20-canonical-cumulative-metric-keys-design.md` §10 rollout with “done” checklist if desired.

---

### Task 7: Documentation note for operators

**Files:**
- Create or modify: `scripts/README.md` (if missing, create short file)

**Step 1:** Document: backup DB, run `npm run migrate:canonical` (or `npx tsx scripts/...`), verify counts, spot-check PRs.

**Step 2: Commit**

```bash
git add scripts/README.md
git commit -m "docs: canonical cumulative migration runbook"
```

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-03-20-canonical-cumulative-metric-keys-implementation.md`.

**Two execution options:**

1. **Subagent-driven (this session)** — Dispatch a fresh subagent per task, review between tasks (@`.cursor/skills/subagent-driven-development`).

2. **Parallel session (separate)** — Open a new session in the worktree with @`.cursor/skills/executing-plans` for batch execution with checkpoints.

**Which approach?**
</think>
Fixing the plan: resolver belongs in a small new module to avoid a `parser` ↔ `metric-utils` circular dependency. Updating the plan file.

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace