# Testing Teams Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a coach optionally mark each men's basketball athlete as Varsity, JV, or C-team on the weight-room roster, and have the existing gym board read those teams without changing its layout or its Top 18 paging.

**Architecture:** Teams belong to the battery, not the athlete. The roster section saves one team per athlete through the group routes that already call `group-store.ts`. The gym board already re-ranks a team when `grouping_mode` is `subteam` and already pages Top 18 at 11 athletes. This plan wires the coach switch and locks the paging contract. It does not redraw the board.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres via `@/lib/db`, SWR, Tailwind.

**Do not:** change `PAGE_SIZE`, `ADVANCE_MS`, mark sizing, column order, or the row layout in `BatteryBoard.tsx`. Do not run `scripts/migrate-testing-battery.sql`. Do not push. Do not start a second dev server. Do not click Reset bibs. Do not set `comparison_session_id`. PowerShell has no `&&` and no bash heredoc. Commit with a PowerShell here-string. `git add` only the files named in the task.

---

### Task 1: Lock Top 18 paging at 11

**Files:**
- Modify: `src/app/battery/[id]/board-logic.test.ts`
- Do not modify: `src/app/battery/[id]/BatteryBoard.tsx`

The production board uses `PAGE_SIZE = 11` and `pageItems`. Top 18 (`cutoff` 18) inserts a line between rows. Teams mode passes `cutoffAfter` as `null`. Neither mode may change how many athletes are on a page.

**Step 1: Write the failing test**

Add this test inside `describe("gym board order")` in `src/app/battery/[id]/board-logic.test.ts`:

```ts
it("keeps 11 athletes on a live page in Top 18 and in Teams", () => {
  const athletes = Array.from({ length: 22 }, (_, index) => athlete(index + 1, 100 - index));
  const rows = orderBoard(athletes, []);
  const line = cutoffAfterIndex(rows, 18);
  const top18 = pageItems(rows, 0, line);
  const teams = pageItems(rows, 0, null);
  expect(top18.filter((item) => item.kind === "row")).toHaveLength(11);
  expect(top18.some((item) => item.kind === "cutoff")).toBe(false);
  expect(teams.filter((item) => item.kind === "row")).toHaveLength(11);
  expect(teams.some((item) => item.kind === "cutoff")).toBe(false);
  const top18Next = pageItems(rows, 1, line);
  expect(top18Next.filter((item) => item.kind === "row")).toHaveLength(11);
  expect(top18Next.some((item) => item.kind === "cutoff")).toBe(true);
});
```

**Step 2: Run the test**

Run: `npx vitest run "src/app/battery/[id]/board-logic.test.ts"`

Expected: PASS. The helper already pages at 11. If it fails, stop and report. Do not edit `BatteryBoard.tsx` to make a new page size.

**Step 3: Commit**

```powershell
git add "src/app/battery/[id]/board-logic.test.ts"
git commit -m @"
test: keep Top 18 and Teams on 11-athlete pages

"@
```

---

### Task 2: Save an optional team from the roster

**Files:**
- Modify: `src/app/battery/[id]/page.tsx` (already passes `coach={session != null}` in the working tree)
- Modify: `src/app/weight-room/rosters/RostersClient.tsx` (already mounts `TestingTeamsSection`)
- Create: `src/app/weight-room/rosters/TestingTeamsSection.tsx`
- Create: `src/app/api/battery/[id]/route.ts`
- Create: `src/app/api/battery/[id]/groups/route.ts`
- Create: `src/app/api/battery/groups/route.ts`
- Test: `src/lib/battery/testing-groups.test.ts`

These files are already in the working tree. Read them. Do not rewrite the gym board. Fix a file only when it breaks one of these rules:

- Each roster athlete has Unassigned, Varsity, JV, and C-team. Unassigned is a real choice and sends `group_key: null`.
- The choice saves on change to `PUT /api/battery/[id]/groups`.
- `GET /api/battery/groups` and both writes require a coach session.
- `PATCH /api/battery/[id]` accepts only `cutoff` or `subteam`.
- `src/app/battery/[id]/page.tsx` passes `coach={session != null}` and does not change the sample query rule already on `main`.
- `BatteryBoard.tsx` is not edited.

**Step 1: Run the helper test**

Run: `npx vitest run src/lib/battery/testing-groups.test.ts "src/app/battery/[id]/board-logic.test.ts"`

Expected: PASS. If `testing-groups.test.ts` fails, fix `testing-groups.ts` only enough for `isGroupingMode` and `preferredGroupKey` to match that test.

**Step 2: Commit only these files**

```powershell
git add "src/app/battery/[id]/page.tsx" "src/app/weight-room/rosters/RostersClient.tsx" "src/app/weight-room/rosters/TestingTeamsSection.tsx" "src/app/api/battery/[id]/route.ts" "src/app/api/battery/[id]/groups/route.ts" "src/app/api/battery/groups/route.ts" "src/lib/battery/testing-groups.test.ts"
git commit -m @"
feat: assign optional testing teams from the roster

"@
```

Do not stage `docs/plans`, `design/`, `.cursor/`, or the battery files that show as modified with no content change.
