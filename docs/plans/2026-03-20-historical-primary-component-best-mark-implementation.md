# Historical Primary-Component Best-Mark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the historical leaderboard picks full-run marks for cumulative metrics (for example, `20m_Accel`) instead of split components.

**Architecture:** Add a small, pure helper that returns the SQL component predicate for historical metric filtering, then apply that predicate in both historical query branches (ascending and descending). Keep Max Velocity logic unchanged. Verify behavior with focused unit tests on the helper and a manual API/UI smoke check.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, Vercel Postgres SQL template tags.

---

### Task 1: Add and test a reusable component-filter helper

**Files:**
- Create: `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/lib/historical-metric-filter.ts`
- Create: `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/lib/historical-metric-filter.test.ts`
- Reference: `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/lib/metric-utils.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getHistoricalComponentFilter } from "./historical-metric-filter";

describe("getHistoricalComponentFilter", () => {
  it("returns null primary for non-cumulative metric", () => {
    const out = getHistoricalComponentFilter("5m_Accel");
    expect(out).toEqual({ primary: null, allowNullComponent: false });
  });

  it("returns primary + null-compatible flag for cumulative metric", () => {
    const out = getHistoricalComponentFilter("20m_Accel");
    expect(out).toEqual({ primary: "0-20m", allowNullComponent: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/historical-metric-filter.test.ts`  
Expected: FAIL with module not found or exported function missing.

**Step 3: Write minimal implementation**

```ts
import { getMetricsRegistry } from "./parser";
import { getPrimaryComponent } from "./metric-utils";

export type HistoricalComponentFilter = {
  primary: string | null;
  allowNullComponent: boolean;
};

export function getHistoricalComponentFilter(metricKey: string): HistoricalComponentFilter {
  const registry = getMetricsRegistry();
  const primary = getPrimaryComponent(metricKey, registry);
  if (primary == null) return { primary: null, allowNullComponent: false };
  return { primary, allowNullComponent: true };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/historical-metric-filter.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/historical-metric-filter.ts src/lib/historical-metric-filter.test.ts
git commit -m "test: add historical component-filter helper for cumulative metrics"
```

---

### Task 2: Apply helper to historical API ascending branch (time metrics)

**Files:**
- Modify: `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/app/api/leaderboard/historical/route.ts`
- Reference: `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/lib/historical-metric-filter.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getHistoricalComponentFilter } from "@/lib/historical-metric-filter";

describe("historical cumulative behavior contract", () => {
  it("uses primary 0-20m for 20m_Accel", () => {
    const filter = getHistoricalComponentFilter("20m_Accel");
    expect(filter.primary).toBe("0-20m");
    expect(filter.allowNullComponent).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/historical-metric-filter.test.ts`  
Expected: FAIL if import path or behavior not yet wired as expected.

**Step 3: Write minimal implementation**

```ts
// route.ts additions (conceptual)
import { getHistoricalComponentFilter } from "@/lib/historical-metric-filter";

const filter = getHistoricalComponentFilter(metric);

// in ASC query WHERE clause
AND e.metric_key = ${metric}
AND (
  ${filter.primary}::text IS NULL
  OR e.component = ${filter.primary}
  OR (${filter.allowNullComponent} AND e.component IS NULL)
)
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/historical-metric-filter.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/leaderboard/historical/route.ts
git commit -m "fix: filter historical cumulative time metrics to primary component"
```

---

### Task 3: Apply same filter to historical API descending branch (non-time metrics)

**Files:**
- Modify: `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/app/api/leaderboard/historical/route.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getHistoricalComponentFilter } from "./historical-metric-filter";

describe("historical filter branch parity", () => {
  it("returns no primary filter for single_interval metrics", () => {
    expect(getHistoricalComponentFilter("Broad_Jump")).toEqual({
      primary: null,
      allowNullComponent: false,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/historical-metric-filter.test.ts`  
Expected: FAIL until the new case is added.

**Step 3: Write minimal implementation**

```ts
// route.ts descending branch WHERE clause mirrors ascending branch
AND e.metric_key = ${metric}
AND (
  ${filter.primary}::text IS NULL
  OR e.component = ${filter.primary}
  OR (${filter.allowNullComponent} AND e.component IS NULL)
)
```

**Step 4: Run test suite for changed units**

Run: `npm run test -- src/lib/historical-metric-filter.test.ts src/lib/metric-utils.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/leaderboard/historical/route.ts src/lib/historical-metric-filter.test.ts
git commit -m "refactor: keep historical primary-component filtering consistent across sort branches"
```

---

### Task 4: Verify no regressions in existing tests and lint

**Files:**
- Verify only (no new files expected)

**Step 1: Run full unit tests**

Run: `npm run test`  
Expected: PASS (or pre-existing failures only, documented separately).

**Step 2: Run lint**

Run: `npm run lint`  
Expected: PASS for touched files.

**Step 3: If failures occur, make minimal fixes**

```ts
// Example minimal fix pattern
const filter = getHistoricalComponentFilter(metric);
```

**Step 4: Re-run verification**

Run: `npm run test && npm run lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/leaderboard/historical/route.ts src/lib/historical-metric-filter.ts src/lib/historical-metric-filter.test.ts
git commit -m "chore: verify historical best-mark fix with tests and lint"
```

---

### Task 5: Manual validation against the bug report

**Files:**
- Verify via API/UI:
  - `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/app/historical/HistoricalClient.tsx`
  - `C:/Users/rossp/OneDrive/Documents/Python Scripts/2026 Coding/lcaspeedjournal-webapp-clean/src/app/api/leaderboard/historical/route.ts`

**Step 1: Start app**

Run: `npm run dev`  
Expected: Next.js dev server starts cleanly.

**Step 2: Hit API directly for a known date window**

Run:
```bash
curl "http://localhost:3000/api/leaderboard/historical?from=2025-01-01&to=2026-12-31&metric=20m_Accel"
```
Expected: returned `display_value` values for best marks are in plausible full-run range (no 0.7-0.8 split winners).

**Step 3: Validate in UI**

Open `/historical`, select `20m_Accel`, compare with known athlete values.

**Step 4: Cross-check progression consistency**

Run:
```bash
curl "http://localhost:3000/api/progression?athlete_id=<known-id>&metric=20m_Accel&from=2025-01-01&to=2026-12-31"
```
Expected: best historical values and progression full-run values are directionally consistent.

**Step 5: Commit**

```bash
git add .
git commit -m "fix: correct historical best-mark selection for cumulative metrics"
```

