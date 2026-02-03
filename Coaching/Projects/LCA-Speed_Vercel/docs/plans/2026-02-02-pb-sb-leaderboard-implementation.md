# PB/SB Leaderboard Badge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Personal Best (PB) or Season Best (SB) badge on each Live leaderboard card (bottom-left), using calendar year for “season,” with PB taking precedence over SB. No new endpoint; extend GET /api/leaderboard and LeaderboardCard UI.

**Architecture:** Extend `LeaderboardRow` with optional `best_type: "pb" | "sb"`. In the leaderboard API, after building the ranked rows and session-to-session comparison, run two bulk queries (all-time best and season best per athlete for the same metric/interval/component), then set `best_type` on each row. In the UI, add a bottom row: PB/SB badge on the left, existing improvement pill on the right.

**Tech Stack:** Next.js App Router, Vercel Postgres (`sql`), React, Tailwind CSS. No new dependencies.

**Design reference:** `docs/plans/2026-02-02-pb-sb-leaderboard-design.md`

---

## Task 1: Extend LeaderboardRow type

**Files:**
- Modify: `src/types/index.ts` (LeaderboardRow)

**Step 1: Add optional best_type to LeaderboardRow**

In `src/types/index.ts`, add to the `LeaderboardRow` type (after `trend?`):

```ts
  trend?: LeaderboardTrend;
  /** PB = all-time best for this metric (+ component); SB = season best (calendar year), only when not PB */
  best_type?: "pb" | "sb";
};
```

**Step 2: Verify types compile**

Run: `cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Coaching\Projects\LCA-Speed_Vercel" && npx tsc --noEmit`  
Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(leaderboard): add best_type to LeaderboardRow for PB/SB"
```

---

## Task 2: API — Fetch session date and derive calendar year

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Step 1: Capture session_date from existing session query**

The route already runs:

```ts
const sessionRows = await sql`
  SELECT id, session_date FROM sessions WHERE id = ${session_id} LIMIT 1
`;
```

After the `if (!sessionRows.rows.length)` block, add:

```ts
const sessionDateStr = (sessionRows.rows[0] as { session_date: string }).session_date;
const sessionDate = new Date(sessionDateStr + "T12:00:00");
const year = sessionDate.getFullYear();
const seasonStart = `${year}-01-01`;
const seasonEnd = `${year}-12-31`;
```

Use `sessionDateStr` / `seasonStart` / `seasonEnd` in the next task. No response shape change yet.

**Step 2: Verify build**

Run: `npm run build`  
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat(leaderboard): derive calendar year for session (PB/SB)"
```

---

## Task 3: API — All-time best per athlete (same metric/interval/component)

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Step 1: Add bulk query for all-time best after prevMap is built**

After the block that fills `prevMap` (after the `for (const p of prevResult.rows ...)` loop), and before `const leaderboardRows: LeaderboardRow[] = rows.map(...)`:

- If `rows.length === 0`, skip the new logic.
- Otherwise, build `athleteIds` (already available as `rows.map((r) => r.athlete_id)`).
- Run one SQL query that returns, for each athlete in `athleteIds`, the all-time best `display_value` for the given `metric`, with the same `interval_index` and `component` filters as the main leaderboard. Time metric: MIN(display_value); distance/speed: MAX(display_value). Use the same `sortAsc` as the leaderboard (time = sortAsc).

Example shape (single query, two branches for sortAsc):

```ts
type BestRow = { athlete_id: string; best_value: number };
let allTimeBestMap = new Map<string, number>();
if (rows.length > 0) {
  const athleteIds = rows.map((r) => r.athlete_id);
  const allTimeResult = sortAsc
    ? await sql`
        SELECT e.athlete_id, MIN(e.display_value)::float AS best_value
        FROM entries e
        WHERE e.metric_key = ${metric}
          AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
          AND (${component}::text IS NULL OR e.component = ${component})
          AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
        GROUP BY e.athlete_id
      `
    : await sql`
        SELECT e.athlete_id, MAX(e.display_value)::float AS best_value
        FROM entries e
        WHERE e.metric_key = ${metric}
          AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
          AND (${component}::text IS NULL OR e.component = ${component})
          AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
        GROUP BY e.athlete_id
      `;
  for (const r of allTimeResult.rows as BestRow[]) {
    allTimeBestMap.set(r.athlete_id, Number(r.best_value));
  }
}
```

**Step 2: Verify build**

Run: `npm run build`  
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat(leaderboard): query all-time best per athlete for PB"
```

---

## Task 4: API — Season best per athlete (calendar year)

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Step 1: Add bulk query for season best**

After the all-time best query and loop, add a similar block for season best: same metric/interval/component and same MIN/MAX rule, but restrict to entries whose session has `session_date` between `seasonStart` and `seasonEnd`. Join `entries` with `sessions` and filter `s.session_date >= seasonStart AND s.session_date <= seasonEnd`. Store results in `seasonBestMap: Map<string, number>`.

Example:

```ts
let seasonBestMap = new Map<string, number>();
if (rows.length > 0 && seasonStart && seasonEnd) {
  const athleteIds = rows.map((r) => r.athlete_id);
  const seasonResult = sortAsc
    ? await sql`
        SELECT e.athlete_id, MIN(e.display_value)::float AS best_value
        FROM entries e
        JOIN sessions s ON s.id = e.session_id
        WHERE e.metric_key = ${metric}
          AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
          AND (${component}::text IS NULL OR e.component = ${component})
          AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
          AND s.session_date >= ${seasonStart}::date AND s.session_date <= ${seasonEnd}::date
        GROUP BY e.athlete_id
      `
    : await sql`
        SELECT e.athlete_id, MAX(e.display_value)::float AS best_value
        FROM entries e
        JOIN sessions s ON s.id = e.session_id
        WHERE e.metric_key = ${metric}
          AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
          AND (${component}::text IS NULL OR e.component = ${component})
          AND e.athlete_id = ANY(${athleteIds as unknown as string}::uuid[])
          AND s.session_date >= ${seasonStart}::date AND s.session_date <= ${seasonEnd}::date
        GROUP BY e.athlete_id
      `;
  for (const r of seasonResult.rows as BestRow[]) {
    seasonBestMap.set(r.athlete_id, Number(r.best_value));
  }
}
```

**Step 2: Verify build**

Run: `npm run build`  
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat(leaderboard): query season best per athlete for SB"
```

---

## Task 5: API — Set best_type on each LeaderboardRow

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

**Step 1: In the rows.map that builds leaderboardRows, set out.best_type**

Inside the `rows.map` callback, after setting `out.trend` (and any other existing fields), add:

- `const current = Number(r.display_value);` (already available as `current` in the existing code).
- `const allTimeBest = allTimeBestMap.get(r.athlete_id);`
- `const seasonBest = seasonBestMap.get(r.athlete_id);`
- If `allTimeBest != null` and current equals allTimeBest (use a small epsilon for float if needed, e.g. `Math.abs(current - allTimeBest) < 1e-9`), set `out.best_type = "pb"`.
- Else if `seasonBest != null` and current equals seasonBest, set `out.best_type = "sb"`.
- Otherwise leave `best_type` undefined.

**Step 2: Verify API returns best_type**

Run dev server: `npm run dev`. Then with a valid `session_id` and `metric` (and optional `interval_index`, `component`), call:

```bash
curl -s "http://localhost:3000/api/leaderboard?session_id=<SESSION_ID>&metric=<METRIC>" | head -c 2000
```

Inspect JSON: some `data.rows[].best_type` should be `"pb"` or `"sb"` where the mark is a best; others absent.

**Step 3: Commit**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat(leaderboard): set best_type pb/sb on leaderboard rows"
```

---

## Task 6: UI — Bottom row layout and PB/SB badge (bottom-left)

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Restructure card bottom so PB/SB is left, improvement pill right**

In `LeaderboardCard`, the bottom currently has only the comparison pill (when present). Change to a bottom row that contains:
- Left: PB or SB badge when `row.best_type === "pb"` or `row.best_type === "sb"`.
- Right: existing improvement pill (unchanged).

Use a wrapper div with `flex justify-between items-center mt-2` (or equivalent). Left side: render a span for PB or SB only when `row.best_type` is defined. Right side: existing pill. Ensure when only one is present it still aligns correctly (e.g. left badge alone, or right pill alone).

**Step 2: Add badge styling and content**

- PB: text "PB", class e.g. `px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/50`.
- SB: text "SB", class e.g. `px-2 py-0.5 rounded-full border text-xs font-semibold bg-foreground-muted/20 text-foreground-muted border-border`.
- Add `title` tooltip: "Personal best" for PB, "Season best" (or "Season best YYYY" if you pass year) for SB.
- Add `aria-label`: "Personal best" / "Season best".

**Step 3: Verify UI**

Run: `npm run dev`. Open Leaderboard, select a session and metric. Confirm:
- Cards with a PB show "PB" bottom-left (gold/amber).
- Cards with SB only show "SB" bottom-left (muted).
- Improvement pill still appears bottom-right when applicable.
- No badge when neither PB nor SB.

**Step 4: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): PB/SB badge bottom-left on leaderboard cards"
```

---

## Task 7: Final verification and doc

**Files:**
- Modify: `docs/plans/2026-02-02-pb-sb-leaderboard-implementation.md` (optional: add “Done” checkboxes)

**Step 1: Full verification**

- Run: `npm run build`  
  Expected: Success.
- Run: `npm run dev`. Manually: Leaderboard → session + metric. Confirm PB/SB badges and improvement pill; first-ever mark shows PB; first mark of year (not PB) shows SB.
- Run: `npm run lint`  
  Expected: No errors.

**Step 2: Commit**

```bash
git add docs/plans/
git commit -m "docs: add PB/SB leaderboard design and implementation plan"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | ✅ Extend `LeaderboardRow` with `best_type?: "pb" \| "sb"` |
| 2 | ✅ Derive calendar year from session date in leaderboard API |
| 3 | ✅ Query all-time best per athlete (same metric/interval/component) |
| 4 | ✅ Query season best per athlete (calendar year) |
| 5 | ✅ Set `best_type` on each row (PB if current === all-time best, else SB if current === season best) |
| 6 | ✅ LeaderboardCard: bottom row with PB/SB badge left, improvement pill right; styling and a11y |
| 7 | ✅ Build, manual UI check, lint, commit |

**Reference:** Design and edge cases: `docs/plans/2026-02-02-pb-sb-leaderboard-design.md`
