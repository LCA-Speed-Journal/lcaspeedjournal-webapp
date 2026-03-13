# Leaderboard Name Truncation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Truncate staff names to first-initial format (e.g., "J. Vaala") in leaderboard displays; on mobile, truncate all names for shorter text per card.

**Architecture:** Add `athlete_type` to leaderboard API responses, create a shared `formatLeaderboardName()` utility and `useIsMobile()` hook, then apply the formatter in Live leaderboard cards, Historical leaderboard cards, and Historical bar chart labels. Full design: `docs/plans/2026-02-10-leaderboard-name-truncation-design.md`

**Tech Stack:** Next.js, React, TypeScript, Vitest, Tailwind (sm = 640px)

---

## Task 1: formatLeaderboardName utility (TDD)

**Files:**
- Create: `src/lib/display-names.ts`
- Create: `src/lib/display-names.test.ts`

**Step 1: Write the failing test**

Create `src/lib/display-names.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatLeaderboardName } from "./display-names";

describe("formatLeaderboardName", () => {
  it("returns first initial + last name for staff on desktop", () => {
    expect(
      formatLeaderboardName("Jon", "Vaala", "staff", false)
    ).toBe("J. Vaala");
  });

  it("returns first initial + last name for staff on mobile", () => {
    expect(
      formatLeaderboardName("Jon", "Vaala", "staff", true)
    ).toBe("J. Vaala");
  });

  it("returns full name for athlete on desktop", () => {
    expect(
      formatLeaderboardName("Sarah", "Johnson", "athlete", false)
    ).toBe("Sarah Johnson");
  });

  it("returns first initial + last name for athlete on mobile", () => {
    expect(
      formatLeaderboardName("Sarah", "Johnson", "athlete", true)
    ).toBe("S. Johnson");
  });

  it("returns full name for alumni on desktop", () => {
    expect(
      formatLeaderboardName("Mike", "Smith", "alumni", false)
    ).toBe("Mike Smith");
  });

  it("returns first initial + last name for alumni on mobile", () => {
    expect(
      formatLeaderboardName("Mike", "Smith", "alumni", true)
    ).toBe("M. Smith");
  });

  it("treats undefined athlete_type as athlete on desktop", () => {
    expect(
      formatLeaderboardName("Jane", "Doe", undefined, false)
    ).toBe("Jane Doe");
  });

  it("returns only last_name when first_name is empty", () => {
    expect(
      formatLeaderboardName("", "Smith", "staff", false)
    ).toBe("Smith");
  });

  it("returns full first_name when last_name is empty", () => {
    expect(
      formatLeaderboardName("Jon", "", "athlete", false)
    ).toBe("Jon");
  });

  it("returns empty string when both names are empty", () => {
    expect(formatLeaderboardName("", "", "athlete", false)).toBe("");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/display-names.test.ts -v
```

Expected: FAIL — `formatLeaderboardName` not found or module not found

**Step 3: Write minimal implementation**

Create `src/lib/display-names.ts`:

```ts
export function formatLeaderboardName(
  first_name: string,
  last_name: string,
  athlete_type: "athlete" | "staff" | "alumni" | undefined,
  isMobile: boolean
): string {
  const first = (first_name ?? "").trim();
  const last = (last_name ?? "").trim();
  const type = athlete_type ?? "athlete";

  const useShort = type === "staff" || isMobile;
  if (!useShort) {
    if (!first && !last) return "";
    if (!last) return first;
    if (!first) return last;
    return `${first} ${last}`;
  }

  if (!last) return first;
  const initial = first ? `${first.charAt(0)}. ` : "";
  return `${initial}${last}`.trim();
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/display-names.test.ts -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/display-names.ts src/lib/display-names.test.ts
git commit -m "feat: add formatLeaderboardName utility"
```

---

## Task 2: LeaderboardRow type and useIsMobile hook

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/hooks/useMediaQuery.ts`

**Step 1: Add athlete_type to LeaderboardRow**

In `src/types/index.ts`, add to `LeaderboardRow` (after `best_type`):

```ts
  best_type?: "pb" | "sb";
  /** athlete | staff | alumni; used for name truncation */
  athlete_type?: "athlete" | "staff" | "alumni";
};
```

**Step 2: Create useIsMobile hook**

Create `src/hooks/useMediaQuery.ts`:

```ts
"use client";

import { useState, useEffect } from "react";

/** Returns true when viewport width is below 640px (Tailwind sm breakpoint). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
```

**Step 3: Commit**

```bash
git add src/types/index.ts src/hooks/useMediaQuery.ts
git commit -m "feat: add athlete_type to LeaderboardRow and useIsMobile hook"
```

---

## Task 3: Live leaderboard API — include athlete_type

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Step 1: Add athlete_type to Row type**

In `src/app/api/leaderboard/route.ts`, update the `Row` type (lines 86–95) to include `athlete_type`:

```ts
    type Row = {
      rank: number;
      athlete_id: string;
      first_name: string;
      last_name: string;
      gender: string;
      athlete_type: string;
      display_value: number;
      units: string;
    };
```

**Step 2: Add a.athlete_type to both CTE SELECTs**

In the sortAsc CTE (~lines 99–124), change the SELECT in the `best` CTE to include `a.athlete_type`, and the outer SELECT to include `athlete_type`. In the sortDesc CTE (~lines 126–155), do the same.

Exact change for sortAsc block — in the WITH best CTE, add `a.athlete_type` to the SELECT:

```sql
SELECT
  e.athlete_id,
  e.display_value,
  e.units,
  a.first_name,
  a.last_name,
  a.gender,
  a.athlete_type
FROM entries e
...
```

And in the outer SELECT:

```sql
SELECT
  (ROW_NUMBER() OVER (ORDER BY display_value ASC))::int AS rank,
  athlete_id,
  first_name,
  last_name,
  gender,
  athlete_type,
  display_value,
  units
FROM best
```

Apply equivalent changes to the sortDesc block.

**Step 3: Include athlete_type in leaderboardRows mapping**

In the `leaderboardRows` mapping (around line 291), add:

```ts
      out: LeaderboardRow = {
        rank: r.rank,
        athlete_id: r.athlete_id,
        first_name: r.first_name,
        last_name: r.last_name,
        gender: r.gender,
        athlete_type: (r.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
        display_value: current,
        units: r.units,
      };
```

**Step 4: Run existing tests**

```bash
npx vitest run -v
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat: include athlete_type in leaderboard API response"
```

---

## Task 4: Historical leaderboard API — include athlete_type

**Files:**
- Modify: `src/app/api/leaderboard/historical/route.ts`

**Step 1: Add athlete_type to Row type**

Add `athlete_type: string` to the `Row` type (lines 12–21).

**Step 2: Add a.athlete_type to filtered CTE and SELECT for Max Velocity**

In the Max Velocity branch, update the filtered CTE string to include `a.athlete_type` in the SELECT. Update the `best` CTE and outer SELECT to include `athlete_type`.

Change the filtered CTE from:
`a.first_name, a.last_name, a.gender`
to:
`a.first_name, a.last_name, a.gender, a.athlete_type`

Change the best CTE and outer SELECT to include `athlete_type` in the column list.

**Step 3: Add athlete_type to regular metric queries**

In both the sortAsc and sortDesc sql blocks (lines 127–166), add `a.athlete_type` to the filtered CTE SELECT and to the best CTE and outer SELECT.

**Step 4: Include athlete_type in leaderboardRows mapping**

In both mapping blocks (Max Velocity ~line 86, regular ~line 170), add:

```ts
athlete_type: (r.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
```

**Step 5: Commit**

```bash
git add src/app/api/leaderboard/historical/route.ts
git commit -m "feat: include athlete_type in historical leaderboard API response"
```

---

## Task 5: Live leaderboard UI — LeaderboardCard

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Wire formatter and hook in LeaderboardCard**

- Import `formatLeaderboardName` from `@/lib/display-names` and `useIsMobile` from `@/hooks/useMediaQuery`.
- In `LeaderboardCard`, call `useIsMobile()`.
- Replace the name span content. Build `displayName` and `fullName`:

```ts
const fullName = `${row.first_name} ${row.last_name}`.trim();
const displayName = formatLeaderboardName(
  row.first_name,
  row.last_name,
  row.athlete_type,
  isMobile
);
```

- Replace:
  `{row.first_name} {row.last_name}`
  with:
  `<span title={displayName !== fullName ? fullName : undefined}>{displayName}</span>`

**Step 2: Ensure LeaderboardCard has access to useIsMobile**

`LeaderboardCard` is a client component (file has "use client"), so it can use `useIsMobile` directly. Add the hook call at the top of the component.

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat: truncate names in Live leaderboard cards"
```

---

## Task 6: Historical leaderboard UI — cards and bar chart

**Files:**
- Modify: `src/app/historical/HistoricalClient.tsx`
- Modify: `src/app/historical/HistoricalLeaderboardBar.tsx`

**Step 1: Add useIsMobile and formatLeaderboardName to HistoricalClient**

Import `formatLeaderboardName` from `@/lib/display-names` and `useIsMobile` from `@/hooks/useMediaQuery`. Call `useIsMobile()` at the top of the component.

**Step 2: Replace name display in leaderboard cards**

Create a helper or inline call for display name. For each of the three card name spans (male, female, ungrouped — lines ~358, 385, 411), replace `{r.first_name} {r.last_name}` with:

```ts
{(() => {
  const fullName = `${r.first_name} ${r.last_name}`.trim();
  const displayName = formatLeaderboardName(
    r.first_name,
    r.last_name,
    r.athlete_type,
    isMobile
  );
  return (
    <span title={displayName !== fullName ? fullName : undefined}>
      {displayName}
    </span>
  );
})()}
```

Or extract a small helper component/hook to keep JSX clean.

**Step 3: Pass isMobile to HistoricalLeaderboardBar**

Find where `HistoricalLeaderboardBar` is rendered. Add prop `isMobile={isMobile}`.

**Step 4: Update HistoricalLeaderboardBar**

- Add `isMobile?: boolean` to the Props type.
- Replace `shortLabel(row)` with `formatLeaderboardName(row.first_name, row.last_name, row.athlete_type, isMobile ?? false)` for the `name` field in the data mapping.
- Keep `fullName` as `${r.first_name} ${r.last_name}` for tooltips.
- Remove the `shortLabel` function if it is no longer used.

**Step 5: Verify build**

```bash
npm run build
```

Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/app/historical/HistoricalClient.tsx src/app/historical/HistoricalLeaderboardBar.tsx
git commit -m "feat: truncate names in Historical leaderboard cards and bar chart"
```

---

## Task 7: Update leaderboardDiff test (if needed)

**Files:**
- Modify: `src/app/leaderboard/leaderboardDiff.test.ts`

**Step 1: Add athlete_type to row helper if LeaderboardRow requires it**

`athlete_type` is optional on `LeaderboardRow`, so existing tests may not need changes. Run:

```bash
npx vitest run -v
```

If any test fails due to type or runtime issues, add `athlete_type: "athlete"` (or omit, since it's optional) to the `row` helper as needed.

**Step 2: Commit (only if changes made)**

```bash
git add src/app/leaderboard/leaderboardDiff.test.ts
git commit -m "fix: update leaderboardDiff tests for athlete_type"
```

---

## Verification checklist

- [ ] `npx vitest run` — all tests pass
- [ ] `npm run build` — build succeeds
- [ ] Live leaderboard: staff shows "J. Vaala"; athlete shows full name on desktop
- [ ] Resize to &lt;640px: all names show first-initial format
- [ ] Historical leaderboard cards: same behavior
- [ ] Historical bar chart X-axis: truncated labels; tooltip shows full name
