# Group-by-Gender Display Rank Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When "Group by gender" is enabled, show rank relative to each gender (#1, #2, #3… and gold/silver/bronze per section) on session leaderboard, historical leaderboard, and historical bar chart; when off, keep absolute rank.

**Architecture:** UI-only change. No API or type changes. When rendering grouped Boys/Girls lists, use position-in-list (index + 1) as the display rank for badge, rankClass, and first-place styling. LeaderboardCard gets an optional `displayRank` prop; HistoricalClient and HistoricalLeaderboardBar use index + 1 inline in their grouped branches.

**Tech Stack:** React, Next.js, TypeScript, Framer Motion (LeaderboardClient), Recharts (HistoricalLeaderboardBar).

**Reference:** Design: `docs/plans/2026-02-11-group-by-gender-display-rank-design.md`

---

## Task 1: Add optional `displayRank` to LeaderboardCard

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (LeaderboardCard component and its call sites)

**Step 1: Add `displayRank` prop and use it for display**

In `LeaderboardClient.tsx`, update the `LeaderboardCard` component (around lines 462–547):

- Add optional prop `displayRank?: number` to the props type.
- Define a variable at the start of the component: `const rank = displayRank ?? row.rank;`
- Replace every use of `row.rank` in the card with `rank`: in `className={rankClass(...)}`, in the badge `#{...}`, and in the two `row.rank === 1` checks for gold text.

**Exact changes:**

1. Change the props type from:

```ts
}: {
  row: LeaderboardRow;
  units: string;
  animationTrigger?: LeaderboardAnimationTrigger | null;
}) {
```

to:

```ts
  displayRank,
}: {
  row: LeaderboardRow;
  units: string;
  animationTrigger?: LeaderboardAnimationTrigger | null;
  displayRank?: number;
}) {
  const rank = displayRank ?? row.rank;
```

2. Replace `rankClass(row.rank)` with `rankClass(rank)` (one place in the motion.div className).
3. Replace `#{row.rank}` with `#{rank}` (badge span).
4. Replace both `row.rank === 1` with `rank === 1` (the two spans that use "text-gold-text").

**Step 2: Verify ungrouped view still works**

Run the app; open Leaderboard, leave "Group by gender" unchecked. Confirm cards still show #1, #2, #3… and gold/silver/bronze for top three. (No behavior change yet since we don’t pass `displayRank`.)

**Step 3: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): LeaderboardCard optional displayRank for group-by-gender rank"
```

---

## Task 2: Pass `displayRank` in LeaderboardClient grouped branch

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (grouped male/female map callbacks, ~360–391)

**Step 1: Use index in map and pass displayRank**

In the `showGrouped` branch:

- Change `male.map((r) => (` to `male.map((r, i) => (`
- Add prop `displayRank={i + 1}` to `LeaderboardCard` for male section.
- Change `female.map((r) => (` to `female.map((r, i) => (`
- Add prop `displayRank={i + 1}` to `LeaderboardCard` for female section.

**Exact changes:**

Male section (around 365–372):

```ts
{male.map((r, i) => (
  <LeaderboardCard
    key={r.athlete_id}
    row={r}
    units={r.units ?? defaultUnits}
    animationTrigger={triggerMap.get(r.athlete_id) ?? null}
    displayRank={i + 1}
  />
))}
```

Female section (around 380–387):

```ts
{female.map((r, i) => (
  <LeaderboardCard
    key={r.athlete_id}
    row={r}
    units={r.units ?? defaultUnits}
    animationTrigger={triggerMap.get(r.athlete_id) ?? null}
    displayRank={i + 1}
  />
))}
```

**Step 2: Run existing tests**

Run: `npm test` (or `npx vitest run`)

Expected: All tests pass (leaderboardDiff tests unchanged).

**Step 3: Manual check**

Open Leaderboard, select a session with both boys and girls, enable "Group by gender". Boys section should show #1, #2, #3…; Girls section should show #1, #2, #3… with gold/silver/bronze for each section’s top three.

**Step 4: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): use per-gender display rank when group by gender is on"
```

---

## Task 3: HistoricalClient grouped cards use per-gender rank

**Files:**
- Modify: `src/app/historical/HistoricalClient.tsx` (grouped male/female card maps, ~351–378 and ~386–415)

**Step 1: Use (r, i) and displayRank in Boys section**

Change `male.map((r) => (` to `male.map((r, i) => (` and define `displayRank = i + 1`. Use `displayRank` for:
- `rankClass(displayRank)` in the div className
- `#{displayRank}` in the badge span

**Exact change for Boys block (lines 351–378):**

Replace:

```ts
{male.map((r) => (
  <div
    key={r.athlete_id}
    className={`relative flex flex-col rounded-lg border p-3 ${rankClass(r.rank)}`}
```

with:

```ts
{male.map((r, i) => {
  const displayRank = i + 1;
  return (
  <div
    key={r.athlete_id}
    className={`relative flex flex-col rounded-lg border p-3 ${rankClass(displayRank)}`}
```

Replace the badge line `#{r.rank}` with `#{displayRank}` in that same block. Close the callback with `);})}` instead of `))}` (add `});` before the closing `)}`).

**Step 2: Same for Girls section**

Apply the same pattern for `female.map`: use `(r, i)`, `displayRank = i + 1`, `rankClass(displayRank)`, `#{displayRank}`, and close with `);})}`.

**Step 3: Verify**

Run app, open Historical, set date range and metric so there’s data, enable "Group by gender". Boys and Girls cards should each show #1, #2, #3… with gold/silver/bronze per section.

**Step 4: Commit**

```bash
git add src/app/historical/HistoricalClient.tsx
git commit -m "feat(historical): per-gender display rank when group by gender is on"
```

---

## Task 4: HistoricalLeaderboardBar tooltip rank per section

**Files:**
- Modify: `src/app/historical/HistoricalLeaderboardBar.tsx` (boysData/girlsData construction, ~76–91)

**Step 1: Use index for rank in boysData and girlsData**

When building `boysData` and `girlsData`, use the map index for `rank` so tooltips show "#1", "#2", etc. per section.

Change:

```ts
const boysData = male.map((r) => ({
  name: formatLeaderboardName(r.first_name, r.last_name, r.athlete_type, isMobile),
  fullName: `${r.first_name} ${r.last_name}`.trim(),
  value: Number(r.display_value),
  rank: r.rank,
  source_metric_key: r.source_metric_key,
  gender: "M",
}));
const girlsData = female.map((r) => ({
  name: formatLeaderboardName(r.first_name, r.last_name, r.athlete_type, isMobile),
  fullName: `${r.first_name} ${r.last_name}`.trim(),
  value: Number(r.display_value),
  rank: r.rank,
  source_metric_key: r.source_metric_key,
  gender: "F",
}));
```

to:

```ts
const boysData = male.map((r, i) => ({
  name: formatLeaderboardName(r.first_name, r.last_name, r.athlete_type, isMobile),
  fullName: `${r.first_name} ${r.last_name}`.trim(),
  value: Number(r.display_value),
  rank: i + 1,
  source_metric_key: r.source_metric_key,
  gender: "M",
}));
const girlsData = female.map((r, i) => ({
  name: formatLeaderboardName(r.first_name, r.last_name, r.athlete_type, isMobile),
  fullName: `${r.first_name} ${r.last_name}`.trim(),
  value: Number(r.display_value),
  rank: i + 1,
  source_metric_key: r.source_metric_key,
  gender: "F",
}));
```

**Step 2: Verify**

Historical page, "Group by gender" on, Bar chart view. Hover bars: Boys chart tooltip should show "#1", "#2", …; Girls chart tooltip should show "#1", "#2", …

**Step 3: Commit**

```bash
git add src/app/historical/HistoricalLeaderboardBar.tsx
git commit -m "feat(historical): bar chart tooltip rank per gender when grouped"
```

---

## Task 5: Final verification and docs

**Files:**
- None (verification only)

**Step 1: Run full test suite**

Run: `npm test` (or `npx vitest run`)

Expected: All tests pass.

**Step 2: Manual regression**

- Leaderboard, group by gender **off**: Ranks are absolute (#1–#N). Gold/silver/bronze on top three overall.
- Leaderboard, group by gender **on**: Boys #1–#n, Girls #1–#m; gold/silver/bronze in each section.
- Historical (cards), same two cases.
- Historical (bar), group by gender on: tooltips show per-section rank.

**Step 3: Commit (if any doc or comment added)**

If no further changes, no commit needed. Plan complete.
