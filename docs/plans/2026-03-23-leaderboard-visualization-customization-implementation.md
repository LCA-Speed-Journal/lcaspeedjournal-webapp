# Leaderboard Visualization Customization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add global leaderboard display customization (top-N limit, wide mode, split gender columns) while preserving current defaults and existing API contracts.

**Architecture:** Keep data fetching and ranking unchanged, and add a UI-only display transformation layer in `src/app/leaderboard/displayModes.ts`. `LeaderboardClient` owns new global controls and passes display config into `ComponentLeaderboard`, which renders one of three display patterns (standard, wide, split-gender-columns) using pure helper functions for deterministic behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, SWR, Tailwind CSS, Framer Motion, Vitest.

---

### Task 1: Create display helper module with top-N utilities

**Files:**
- Create: `src/app/leaderboard/displayModes.ts`
- Test: `src/app/leaderboard/displayModes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { clampTopN, applyTopN } from "./displayModes";

describe("displayModes top-N helpers", () => {
  it("clamps topN to safe bounds", () => {
    expect(clampTopN(0)).toBe(1);
    expect(clampTopN(10)).toBe(10);
    expect(clampTopN(999)).toBe(50);
  });

  it("returns original rows when topN is disabled", () => {
    expect(applyTopN([1, 2, 3], 2, false)).toEqual([1, 2, 3]);
  });

  it("truncates rows when topN is enabled", () => {
    expect(applyTopN([1, 2, 3, 4], 2, true)).toEqual([1, 2]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: FAIL with module or export-not-found error.

**Step 3: Write minimal implementation**

```ts
export const TOP_N_MIN = 1;
export const TOP_N_MAX = 50;

export function clampTopN(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(TOP_N_MAX, Math.max(TOP_N_MIN, Math.floor(value)));
}

export function applyTopN<T>(rows: T[], topN: number, enabled: boolean): T[] {
  if (!enabled) return rows;
  const n = clampTopN(topN);
  return rows.slice(0, n);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/leaderboard/displayModes.ts src/app/leaderboard/displayModes.test.ts
git commit -m "feat(leaderboard): add top-N display helper utilities"
```

### Task 2: Add section/grid helper functions for standard vs wide mode

**Files:**
- Modify: `src/app/leaderboard/displayModes.ts`
- Modify: `src/app/leaderboard/displayModes.test.ts`

**Step 1: Write the failing test**

```ts
import type { LeaderboardRow } from "@/types";
import { applyTopNToSections, getGridClass } from "./displayModes";

it("applies topN per section independently", () => {
  const sections = [
    { title: "A", rows: [{ athlete_id: "1" }, { athlete_id: "2" }] as LeaderboardRow[] },
    { title: "B", rows: [{ athlete_id: "3" }, { athlete_id: "4" }] as LeaderboardRow[] },
  ];
  const out = applyTopNToSections(sections, 1, true);
  expect(out[0].rows).toHaveLength(1);
  expect(out[1].rows).toHaveLength(1);
});

it("returns grid classes for default and wide modes", () => {
  expect(getGridClass({ wideMode: false })).toContain("sm:grid-cols-3");
  expect(getGridClass({ wideMode: true })).toContain("lg:grid-cols-5");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: FAIL for missing exports/behavior.

**Step 3: Write minimal implementation**

```ts
type Section<T> = { title: string; rows: T[] };

export function applyTopNToSections<T>(
  sections: Section<T>[],
  topN: number,
  enabled: boolean
): Section<T>[] {
  return sections.map((s) => ({ ...s, rows: applyTopN(s.rows, topN, enabled) }));
}

export function getGridClass({ wideMode }: { wideMode: boolean }): string {
  return wideMode ? "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" : "grid grid-cols-2 gap-3 sm:grid-cols-3";
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/leaderboard/displayModes.ts src/app/leaderboard/displayModes.test.ts
git commit -m "feat(leaderboard): add section truncation and grid mode helpers"
```

### Task 3: Add gender column model helper for split layout

**Files:**
- Modify: `src/app/leaderboard/displayModes.ts`
- Modify: `src/app/leaderboard/displayModes.test.ts`

**Step 1: Write the failing test**

```ts
import type { LeaderboardRow } from "@/types";
import { buildGenderColumnModel } from "./displayModes";

it("builds topN-truncated male and female columns", () => {
  const male = [{ athlete_id: "m1" }, { athlete_id: "m2" }] as LeaderboardRow[];
  const female = [{ athlete_id: "f1" }, { athlete_id: "f2" }] as LeaderboardRow[];
  const out = buildGenderColumnModel({ male, female, topN: 1, topNEnabled: true });
  expect(out.male).toHaveLength(1);
  expect(out.female).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: FAIL for missing helper.

**Step 3: Write minimal implementation**

```ts
import type { LeaderboardRow } from "@/types";

export function buildGenderColumnModel(options: {
  male: LeaderboardRow[];
  female: LeaderboardRow[];
  topN: number;
  topNEnabled: boolean;
}): { male: LeaderboardRow[]; female: LeaderboardRow[] } {
  const { male, female, topN, topNEnabled } = options;
  return {
    male: applyTopN(male, topN, topNEnabled),
    female: applyTopN(female, topN, topNEnabled),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/leaderboard/displayModes.ts src/app/leaderboard/displayModes.test.ts
git commit -m "feat(leaderboard): add gender split display model helper"
```

### Task 4: Add global display state and controls in LeaderboardClient

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`
- Test (optional component smoke coverage if present): `src/app/leaderboard/LeaderboardClient.test.tsx`

**Step 1: Write the failing test**

```ts
// If component testing infrastructure exists:
// Verify Top N toggle reveals numeric input and split-gender is disabled when groupByGender=false.
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/LeaderboardClient.test.tsx`
Expected: FAIL (or skip this step if no React test harness exists yet).

**Step 3: Write minimal implementation**

```tsx
const [topNEnabled, setTopNEnabled] = useState(false);
const [topN, setTopN] = useState(10);
const [wideMode, setWideMode] = useState(false);
const [splitGenderColumns, setSplitGenderColumns] = useState(false);
```

Add control row elements:

- `Top N` checkbox
- numeric `input` shown when enabled
- `Wide mode` checkbox
- `Split gender columns` checkbox with `disabled={!groupByGender}`

Pass new props into each `ComponentLeaderboard`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/LeaderboardClient.test.tsx`
Expected: PASS (or document manual verification if test harness absent).

**Step 5: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx src/app/leaderboard/LeaderboardClient.test.tsx
git commit -m "feat(leaderboard): add global display customization controls"
```

### Task 5: Integrate helper pipeline in ComponentLeaderboard rendering

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`
- Modify: `src/app/leaderboard/displayModes.ts` (if additional helper needed)
- Modify: `src/app/leaderboard/displayModes.test.ts` (if helper added)

**Step 1: Write the failing test**

```ts
// Unit-first path:
// Add helper tests that assert:
// - topN applies after section composition
// - split gender mode uses male/female lists and not generic sections
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: FAIL on new assertions.

**Step 3: Write minimal implementation**

In `ComponentLeaderboard`:

- Compute base sections with `getLeaderboardSections(...)`.
- Compute `sections = applyTopNToSections(baseSections, topN, topNEnabled)`.
- Compute `gridClass = getGridClass({ wideMode })`.
- If `splitGenderColumns && groupByGender`, render two columns from `buildGenderColumnModel(...)`.
- Else render existing section path using `gridClass`.

Keep all existing loading/error/animation logic unchanged.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx src/app/leaderboard/displayModes.ts src/app/leaderboard/displayModes.test.ts
git commit -m "feat(leaderboard): wire top-N, wide, and split-gender rendering modes"
```

### Task 6: Add full-width container behavior for wide/split modes

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Write the failing test**

```ts
// If UI tests exist, assert container class toggles when wide/split modes are enabled.
// Otherwise define manual acceptance checks before coding.
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/LeaderboardClient.test.tsx`
Expected: FAIL (or N/A if no component harness).

**Step 3: Write minimal implementation**

Conditionally change container class:

- Default: keep `mx-auto max-w-4xl`.
- When `wideMode || splitGenderColumns`: use wider layout class (e.g. `max-w-none w-full` with safe padding).

Preserve existing header/control styling.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/LeaderboardClient.test.tsx`
Expected: PASS (or complete manual checks if harness absent).

**Step 5: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx src/app/leaderboard/LeaderboardClient.test.tsx
git commit -m "feat(leaderboard): add full-width container behavior for dense display modes"
```

### Task 7: Regression tests and quality checks

**Files:**
- Modify: `src/app/leaderboard/displayModes.test.ts`
- Verify existing: `src/lib/leaderboard-sections.test.ts`

**Step 1: Write the failing test**

Add test cases for:

- `topNEnabled=false` leaves rows untouched.
- `topN` invalid values clamp correctly.
- gender column model handles one empty side.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts`
Expected: FAIL on new assertions.

**Step 3: Write minimal implementation**

Adjust helper implementations only if needed to satisfy tests (no new feature creep).

**Step 4: Run test to verify it passes**

Run:
- `npm test -- src/app/leaderboard/displayModes.test.ts`
- `npm test -- src/lib/leaderboard-sections.test.ts`
- `npm run lint`

Expected: PASS for all tests and no lint errors in touched files.

**Step 5: Commit**

```bash
git add src/app/leaderboard/displayModes.ts src/app/leaderboard/displayModes.test.ts src/app/leaderboard/LeaderboardClient.tsx
git commit -m "test(leaderboard): add display mode regression coverage and cleanup"
```

### Task 8: Documentation update

**Files:**
- Modify: `docs/plans/2026-03-23-leaderboard-visualization-customization-design.md`
- Optionally Create: `docs/plans/2026-03-23-leaderboard-visualization-customization-implementation-notes.md`

**Step 1: Write the failing test**

N/A (docs-only task).

**Step 2: Run test to verify it fails**

N/A.

**Step 3: Write minimal implementation**

Document:

- final control behavior,
- mode precedence/gating (`splitGenderColumns` requires `groupByGender`),
- default mode guarantees,
- manual QA checklist for projector/live practice usage.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/leaderboard/displayModes.test.ts && npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-23-leaderboard-visualization-customization-design.md docs/plans/2026-03-23-leaderboard-visualization-customization-implementation-notes.md
git commit -m "docs(leaderboard): record display customization implementation details"
```

## End-to-End Verification Checklist

Run in order:

1. `npm test -- src/app/leaderboard/displayModes.test.ts`
2. `npm test -- src/lib/leaderboard-sections.test.ts`
3. `npm run lint`
4. `npm run dev`

Manual verification in browser on `/leaderboard`:

- Default view unchanged on first load.
- Top N truncates visible cards in all modes.
- Wide mode increases horizontal density and screen usage.
- Split gender columns shows boys/girls side-by-side when group-by-gender is on.
- Split gender columns is disabled (or ignored) when group-by-gender is off.
- Loading/error states still behave correctly while polling updates.

