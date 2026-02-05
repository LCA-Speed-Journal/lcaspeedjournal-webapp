# Live Leaderboard Animations — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the leaderboard receives updated data (e.g. after a real-time refetch), animate cards so users see what changed: new entry (fade-in), new to top 3, new PB/SB, or value updated. Triggers are derived client-side by diffing previous vs current snapshot; Framer Motion runs one variant per card; reduced motion respected.

**Architecture:** In `ComponentLeaderboard`, keep the last full API payload in a ref. When SWR returns new `data`, run a pure diff function (prev rows vs current rows per list) to compute triggers; store triggers in state, update ref, clear triggers after a timeout. Pass `animationTrigger` into `LeaderboardCard`. Cards are `motion.div` with layout and variants keyed off trigger; list container uses layout for reorder. Diff and variants are unit-testable and accessibility-friendly (useReducedMotion).

**Tech Stack:** Next.js App Router, React, SWR, Framer Motion, Tailwind CSS, Vitest (for diff tests). No API changes.

**Design reference:** `docs/plans/2026-02-04-leaderboard-animations-design.md`

---

## Task 1: Add Framer Motion dependency

**Files:**
- Modify: `package.json`

**Step 1: Install framer-motion**

Run: `cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Coaching\Projects\LCA-Speed_Vercel" && npm install framer-motion`

Expected: Package added to dependencies; `package-lock.json` updated.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add framer-motion for leaderboard animations"
```

---

## Task 2: Add LeaderboardAnimationTrigger type

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add trigger type after LeaderboardRow**

In `src/types/index.ts`, after the closing `};` of `LeaderboardRow`, add:

```ts
/** Animation trigger derived from diff(prev, current) leaderboard rows. One per card per refetch. */
export type LeaderboardAnimationTrigger =
  | "new-entry"
  | "new-entry-top-three"
  | "new-top-three"
  | "new-pb"
  | "new-sb"
  | "value-updated";
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(leaderboard): add LeaderboardAnimationTrigger type"
```

---

## Task 3: Add Vitest and failing test for leaderboard diff

**Files:**
- Create: `src/app/leaderboard/leaderboardDiff.ts` (stub that returns empty Map)
- Create: `src/app/leaderboard/leaderboardDiff.test.ts`
- Modify: `package.json` (add vitest, test script)

**Step 1: Add Vitest**

Run: `cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Coaching\Projects\LCA-Speed_Vercel" && npm install -D vitest`

**Step 2: Add test script**

In `package.json`, add to `"scripts"`: `"test": "vitest run"`. Ensure `vitest` is in devDependencies after install.

**Step 3: Create stub diff and test file**

Create `src/app/leaderboard/leaderboardDiff.ts`:

```ts
import type { LeaderboardRow, LeaderboardAnimationTrigger } from "@/types";

/**
 * Returns a map of athlete_id -> animation trigger by diffing prev vs next rows.
 * When prev is null/undefined, returns empty Map (first load).
 * Priority: new-entry > new-entry-top-three > new-top-three > new-pb > new-sb > value-updated.
 */
export function computeLeaderboardTriggers(
  prevRows: LeaderboardRow[] | null | undefined,
  nextRows: LeaderboardRow[]
): Map<string, LeaderboardAnimationTrigger> {
  return new Map();
}
```

Create `src/app/leaderboard/leaderboardDiff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeLeaderboardTriggers } from "./leaderboardDiff";
import type { LeaderboardRow } from "@/types";

function row(overrides: Partial<LeaderboardRow> & { athlete_id: string; rank: number; display_value: number }): LeaderboardRow {
  return {
    athlete_id: overrides.athlete_id,
    rank: overrides.rank,
    first_name: "A",
    last_name: "B",
    gender: "m",
    display_value: overrides.display_value,
    units: "s",
    best_type: overrides.best_type,
    ...overrides,
  };
}

describe("computeLeaderboardTriggers", () => {
  it("returns empty map when prev is null (first load)", () => {
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const result = computeLeaderboardTriggers(null, next);
    expect(result.size).toBe(0);
  });

  it("returns empty map when prev is undefined", () => {
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const result = computeLeaderboardTriggers(undefined, next);
    expect(result.size).toBe(0);
  });

  it("assigns new-entry when athlete appears in next but not in prev", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const next = [
      row({ athlete_id: "1", rank: 2, display_value: 10 }),
      row({ athlete_id: "2", rank: 1, display_value: 9 }),
    ];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("2")).toBe("new-entry");
    expect(result.get("1")).toBeUndefined();
  });

  it("assigns new-entry-top-three when new athlete lands in rank 1-3", () => {
    const prev = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "2", rank: 2, display_value: 11 }),
      row({ athlete_id: "3", rank: 3, display_value: 12 }),
    ];
    const next = [
      row({ athlete_id: "4", rank: 1, display_value: 9 }),
      row({ athlete_id: "1", rank: 2, display_value: 10 }),
      row({ athlete_id: "2", rank: 3, display_value: 11 }),
      row({ athlete_id: "3", rank: 4, display_value: 12 }),
    ];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("4")).toBe("new-entry-top-three");
  });

  it("assigns new-top-three when existing athlete moves into top 3", () => {
    const prev = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "2", rank: 2, display_value: 11 }),
      row({ athlete_id: "3", rank: 3, display_value: 12 }),
      row({ athlete_id: "4", rank: 4, display_value: 13 }),
    ];
    const next = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "4", rank: 2, display_value: 10.5 }),
      row({ athlete_id: "2", rank: 3, display_value: 11 }),
      row({ athlete_id: "3", rank: 4, display_value: 12 }),
    ];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("4")).toBe("new-top-three");
  });

  it("assigns new-pb when best_type becomes pb", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: undefined })];
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: "pb" })];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("1")).toBe("new-pb");
  });

  it("assigns new-sb when best_type becomes sb", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: undefined })];
    const next = [row({ athlete_id: "1", rank: 1, display_value: 10, best_type: "sb" })];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("1")).toBe("new-sb");
  });

  it("assigns value-updated when display_value changes for same athlete", () => {
    const prev = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const next = [row({ athlete_id: "1", rank: 1, display_value: 9.8 })];
    const result = computeLeaderboardTriggers(prev, next);
    expect(result.get("1")).toBe("value-updated");
  });

  it("returns empty map when data is identical", () => {
    const rows = [row({ athlete_id: "1", rank: 1, display_value: 10 })];
    const result = computeLeaderboardTriggers(rows, rows);
    expect(result.size).toBe(0);
  });

  it("assigns new-entry when prev is empty and next has rows", () => {
    const next = [
      row({ athlete_id: "1", rank: 1, display_value: 10 }),
      row({ athlete_id: "2", rank: 2, display_value: 11 }),
    ];
    const result = computeLeaderboardTriggers([], next);
    expect(result.get("1")).toBe("new-entry-top-three");
    expect(result.get("2")).toBe("new-entry-top-three");
  });
});
```

**Step 4: Run test to verify it fails**

Run: `npm run test`
Expected: Tests run; at least the non–first-load tests fail (e.g. expect "new-entry" but get undefined). If Vitest is not configured, add `vitest.config.ts` (see Step 5).

**Step 5: Add Vitest config if needed**

If `npm run test` reports "No test files found" or module resolution errors, create `vitest.config.ts` at project root:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Run: `npm run test` again. Expected: Tests run; stub returns empty Map so "first load" passes, others fail.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/app/leaderboard/leaderboardDiff.ts src/app/leaderboard/leaderboardDiff.test.ts vitest.config.ts
git commit -m "test(leaderboard): add Vitest and failing tests for leaderboard diff"
```

---

## Task 4: Implement computeLeaderboardTriggers

**Files:**
- Modify: `src/app/leaderboard/leaderboardDiff.ts`

**Step 1: Implement diff logic**

Replace the stub in `leaderboardDiff.ts` with a full implementation:

- If `prevRows` is null or undefined, return `new Map()`.
- Build a map `prevByAthlete`: athlete_id -> row from prevRows.
- For each row in `nextRows`, determine the single highest-priority trigger (new-entry > new-entry-top-three > new-top-three > new-pb > new-sb > value-updated), and set it in the result Map only if there is a trigger.
- **New entry:** athlete_id not in prevByAthlete → if rank 1–3 use "new-entry-top-three", else "new-entry".
- **New top 3:** athlete was in prev, not in prev top 3 (by rank), now in top 3 → "new-top-three". (Do not assign if this row already got new-entry/new-entry-top-three.)
- **New PB:** best_type === "pb" and (prev had no best_type or different) → "new-pb".
- **New SB:** best_type === "sb" and (prev had no best_type or different) → "new-sb".
- **Value updated:** same athlete in prev, display_value !== prev display_value → "value-updated".

Implementation sketch (expand in file):

```ts
import type { LeaderboardRow, LeaderboardAnimationTrigger } from "@/types";

const TOP_THREE = new Set([1, 2, 3]);

function wasInTopThree(rows: LeaderboardRow[], athleteId: string): boolean {
  const r = rows.find((row) => row.athlete_id === athleteId);
  return r != null && TOP_THREE.has(r.rank);
}

function isTopThree(rank: number): boolean {
  return TOP_THREE.has(rank);
}

export function computeLeaderboardTriggers(
  prevRows: LeaderboardRow[] | null | undefined,
  nextRows: LeaderboardRow[]
): Map<string, LeaderboardAnimationTrigger> {
  const result = new Map<string, LeaderboardAnimationTrigger>();
  if (prevRows == null || prevRows === undefined) return result;
  const prevByAthlete = new Map(prevRows.map((r) => [r.athlete_id, r]));

  for (const next of nextRows) {
    const prev = prevByAthlete.get(next.athlete_id);
    if (prev == null) {
      result.set(next.athlete_id, isTopThree(next.rank) ? "new-entry-top-three" : "new-entry");
      continue;
    }
    const inTopThreeNow = isTopThree(next.rank);
    const inTopThreePrev = wasInTopThree(prevRows, next.athlete_id);
    if (!inTopThreePrev && inTopThreeNow) {
      result.set(next.athlete_id, "new-top-three");
      continue;
    }
    if (next.best_type === "pb" && prev.best_type !== "pb") {
      result.set(next.athlete_id, "new-pb");
      continue;
    }
    if (next.best_type === "sb" && prev.best_type !== "sb") {
      result.set(next.athlete_id, "new-sb");
      continue;
    }
    if (prev.display_value !== next.display_value) {
      result.set(next.athlete_id, "value-updated");
    }
  }
  return result;
}
```

Handle edge case: when `prevRows` is empty array and `nextRows` has data — design says "First load / no previous data: do not run the diff; set no triggers." So only when `prevRows == null` or `prevRows === undefined` we skip; if `prevRows` is `[]`, we still run the diff (so everyone would get new-entry). To match "no triggers on first load", the component will only set prevDataRef after the first successful response, and pass ref.current (which is null on first load). So when the component first gets data, it won't call computeLeaderboardTriggers with that data as "next" and null as prev — it will set ref and not set triggers. When the second fetch comes, prev will be the first payload, next the second. So the diff only needs to handle prev null/undefined as "no triggers". If prev is [] and next has rows, we'd still assign new-entry; that's correct for "previously empty list, now has entries" (e.g. after clearing and re-adding). Keep the implementation as above but fix the condition: when `prevRows == null || prevRows === undefined` return empty. When `prevRows.length === 0` and `nextRows.length > 0`, we can treat all next as new-entry. So:

```ts
if (prevRows == null || prevRows === undefined) return result;
const prevByAthlete = new Map(prevRows.map((r) => [r.athlete_id, r]));
```

No need to special-case prevRows.length === 0; if prev is [], prevByAthlete is empty, so every next row gets new-entry or new-entry-top-three. That's correct. Implement and run tests.

**Step 2: Run tests**

Run: `npm run test`
Expected: All tests in leaderboardDiff.test.ts pass.

**Step 3: Commit**

```bash
git add src/app/leaderboard/leaderboardDiff.ts
git commit -m "feat(leaderboard): implement computeLeaderboardTriggers diff"
```

---

## Task 5: ComponentLeaderboard — prev ref, trigger state, diff on data change, timeout clear

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Add ref, state, and effect in ComponentLeaderboard**

In `ComponentLeaderboard`, add:

- Import: `useRef`, `useEffect`, and `computeLeaderboardTriggers` from `./leaderboardDiff`, and `LeaderboardAnimationTrigger` from `@/types`.
- After the `useSWR` call, add:
  - `const prevDataRef = useRef<{ rows: LeaderboardRow[]; male?: LeaderboardRow[]; female?: LeaderboardRow[] } | null>(null);`
  - `const [triggerMap, setTriggerMap] = useState<Map<string, LeaderboardAnimationTrigger>>(new Map());`
  - `const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);`
- In a `useEffect` that depends on `data` (and url/key so we reset when session/metric/component/groupBy change): when `data?.data` exists, get `rows`, `male`, `female` from it. If `prevDataRef.current == null`, set `prevDataRef.current = { rows, male: male ?? [], female: female ?? [] }` and do not set triggers (first load). Otherwise, for each "list" we display: if `showGrouped` then run diff for male and female separately (prev male vs current male, prev female vs current female), else run diff(prevDataRef.current.rows, rows). Merge all resulting maps (later list overwrites same athlete_id if any; typically no overlap). Set the merged map into state, then `prevDataRef.current = { rows, male: male ?? [], female: female ?? [] }`. Cancel any existing clearTimeoutRef, then set `clearTimeoutRef.current = setTimeout(() => { setTriggerMap(new Map()); clearTimeoutRef.current = null; }, 2000)`. On cleanup of the effect, clear the timeout.
- When sessionId/metric/component/groupByGender change (new url), reset prevDataRef to null so the next load is treated as first load for that board. You can do this by including the `url` in the effect and setting `prevDataRef.current = null` at the start of the effect when the url has changed (use a ref to store last url and compare).

Simpler approach: keep prevDataRef keyed by nothing (one ref per ComponentLeaderboard instance). When the component mounts or url changes, we want to reset prev so the first data we see for this url is "first load". So: when `data` updates, if we don't have a "previous" yet (prevDataRef.current === null), set previous to current and no triggers. Otherwise diff and set triggers, then update previous. When does prev get reset? When the user changes session/metric/component, the component might remount (different key on ComponentLeaderboard) so ref is fresh. If the same component instance is reused for a different url (e.g. same metric but toggled groupByGender), the SWR key (url) changes, so `data` will eventually be the new response. So we need to reset prev when the url changes. In the effect: `const payload = data?.data; if (!payload) return; const rows = payload.rows ?? []; const male = payload.male ?? []; const female = payload.female ?? [];` Then check: if `prevDataRef.current === null`, set `prevDataRef.current = { rows, male, female }; return;`. Otherwise compute triggers: if showGrouped, merge computeLeaderboardTriggers(prevDataRef.current.male, male) and computeLeaderboardTriggers(prevDataRef.current.female, female). Else computeLeaderboardTriggers(prevDataRef.current.rows, rows). setTriggerMap(merged). prevDataRef.current = { rows, male, female }. Clear timeout and set new 2s timeout. Cleanup: clear timeout.

Merging two maps: `const merged = new Map(computeLeaderboardTriggers(prevMale, male)); for (const [id, t] of computeLeaderboardTriggers(prevFemale, female)) merged.set(id, t);`

Reset prev on url change: At the start of the effect, compare `url` to a ref (e.g. `lastUrlRef.current`). If `url !== lastUrlRef.current`, set `prevDataRef.current = null` and `lastUrlRef.current = url`. Then when `data?.data` exists, if `prevDataRef.current === null` (first load for this board), set `prevDataRef.current = { rows, male, female }` and return without setting triggers.

**Step 2: Pass triggerMap and animationTrigger into cards**

Where we render `LeaderboardCard`, pass `animationTrigger={triggerMap.get(r.athlete_id) ?? null}`. So: `<LeaderboardCard key={r.athlete_id} row={r} units={...} animationTrigger={triggerMap.get(r.athlete_id) ?? null} />`.

**Step 3: Verify build and types**

Run: `npx tsc --noEmit` and `npm run build`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): diff prev/current and pass animation triggers to cards"
```

---

## Task 6: LeaderboardCard — motion.div, variants, useReducedMotion

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Add Framer Motion and useReducedMotion**

At top of file: `import { motion, useReducedMotion } from "framer-motion";` and import type `LeaderboardAnimationTrigger` if not already.

**Step 2: Update LeaderboardCard props**

Add `animationTrigger: LeaderboardAnimationTrigger | null` to the card props.

**Step 3: Define variants (subtle to medium per design)**

Define an object or function that returns variants keyed by trigger type and "idle", respecting `useReducedMotion()`. When reduced: no scale, no glow; new-entry can be instant opacity 0 → 1 or minimal. Example (use CSS/Tailwind for glow via ring or box-shadow classes; Framer for opacity/scale/transition):

- idle: no animation (animate to current state).
- new-entry: initial opacity 0, optional y: 4; animate opacity 1, y: 0; transition 300–400 ms, easeOut.
- new-entry-top-three: same as new-entry plus scale 1.02–1.04 briefly (or ring glow); duration under 500 ms.
- new-top-three: brief ring/glow + scale 1.02–1.04, ~500 ms.
- new-pb: accent/gold border or glow, scale 1 → 1.03 → 1, ~400 ms.
- new-sb: soft background tint or ring, ~400 ms.
- value-updated: short border/ring pulse, optional scale 1 → 1.02 → 1, 200–300 ms.

Use `useReducedMotion()`: when true, set variants to no scale (scale: 1 always), no y; only instant or very short opacity for new-entry. Example reduced variant for new-entry: `initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 }`.

**Step 4: Wrap card in motion.div**

Replace the outer `<div>` of LeaderboardCard with `<motion.div layout className={...} style={...} initial={...} animate={...} variants={...}>`. Use `animationTrigger` to select variant: when null, use "idle"; otherwise use the trigger as variant key. Set `initial` and `animate` from the variant (or use `variants` and `initial="idle"` and `animate={animationTrigger ?? "idle"}`).

**Step 5: Verify build and dev**

Run: `npm run build` and quick manual check: open leaderboard, select session/metric, confirm cards render and no console errors.
Expected: Build passes; leaderboard still works.

**Step 6: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): animate LeaderboardCard with Framer Motion variants and reduced motion"
```

---

## Task 7: Layout container for list reorder

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Wrap grid in motion.div with layout**

Where the card list is rendered (both grouped and ungrouped), wrap the grid div in `<motion.div layout className="...">` so that when the list reorders, cards animate to new positions. Keep keys as `r.athlete_id`. Example: `<motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3">...</motion.div>`. Do the same for the "Boys" and "Girls" grids.

**Step 2: Respect reduced motion on layout**

When `useReducedMotion()` is true, you can pass `layout={false}` to the list motion.div to disable layout animation, or keep layout and rely on card variants having no scale/motion. Design says "Optionally disable or shorten layout animation on the list when reduced motion is on." So in the parent that renders the grid, read reduced motion and set `layout={!reducedMotion}`.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): layout animation for list reorder and reduced motion"
```

---

## Task 8: Manual verification and reduced-motion check

**Files:** None (verification only).

**Step 1: Manual smoke test**

Run: `npm run dev`. Open `/leaderboard`, select a session and metric with entries. From another tab or device (or same tab after a refetch), add or edit an entry so SWR refetches. Confirm the affected card(s) show the expected animation (e.g. new entry fades in, value update pulses). Confirm triggers clear after ~2 s.

**Step 2: Reduced motion**

Toggle "Reduce motion" in OS (Windows: Settings > Accessibility > Visual effects > Animation effects) or in DevTools (e.g. `matchMedia('(prefers-reduced-motion: reduce)')`). Refetch with changes; confirm animations are suppressed or minimal (no scale/glow when reduced).

**Step 3: Commit (optional)**

If you made any small tweaks (e.g. timing), commit: `git add -A && git commit -m "chore(leaderboard): animation timing and a11y tweaks"`.

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add framer-motion dependency |
| 2 | Add LeaderboardAnimationTrigger type |
| 3 | Add Vitest and failing tests for leaderboard diff |
| 4 | Implement computeLeaderboardTriggers |
| 5 | ComponentLeaderboard: prev ref, trigger state, diff on data, timeout clear, pass trigger to cards |
| 6 | LeaderboardCard: motion.div, variants, useReducedMotion |
| 7 | List: motion.div layout for reorder, reduced motion |
| 8 | Manual verification and reduced-motion check |

**Reference:** Design doc `docs/plans/2026-02-04-leaderboard-animations-design.md`. @writing-plans @executing-plans
