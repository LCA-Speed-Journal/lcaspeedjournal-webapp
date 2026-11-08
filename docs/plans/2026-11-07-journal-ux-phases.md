# Journal UX phases Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the gym board survive a refresh, label each workout from its group's own dates, and keep phone entry as one submit per attempt, with a design approval before every visual phase.

**Architecture:** A pure date function turns a stored group plus a session date into `Volleyball W1D2` or an Other date. Penpot frames are the design gate. A coach-only preview route checks those frames against `globals.css` before production screens change. Parser, norms, battery scoring, speed windows, and `formatDropoffCaption` stay untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Vercel Postgres `sql` templates, NextAuth credentials, SWR, Penpot remote MCP.

**Product source:** `docs/plans/2026-11-07-journal-ux-phases-design.md`.

**Progress dashboard:** the canvas `journal-ux-phases.canvas.tsx` beside this chat. Do not start a phase whose review gate is still pending there.

---

## Rules the implementer must not break

- Do not edit `src/lib/dropoff/format.ts` or the caption it renders. `Best · Line · N above` is the within-session drop-off. The trend pill is session-to-session.
- Do not delete the phone entry form. Desktop gets a grid beside it.
- Light and dark both ship on every route. Do not lock the board to light.
- Do not commit a Penpot MCP key, `COACH_PIN`, or `.env`.
- New writes call `requireCoachSession`. Parameterized `sql` only.
- Run tests with `npx vitest run <file>`.
- Stop at every gate below. The next task starts only after the named approval.

---

## Gate P — Penpot, before any frame

### Task P1: Connect Penpot

This task is configuration, not app code. No commit.

**Step 1.** Create a free account at penpot.app and a file named `LCA Speed Journal mockups`.

**Step 2.** In Penpot Integrations, generate an MCP key. Copy the URL `https://design.penpot.app/mcp/stream?userToken=...`.

**Step 3.** In Cursor, Settings → Tools & MCP, add that URL. Keep the key out of the repo.

**Step 4.** Open the file and choose File → MCP Server → Connect. Leave the tab open.

**Step 5.** Install skills:

```bash
npx skills add ar27111994/penpot-mcp
```

Open `https://github.com/penpot/penpot-ai-kit` and follow `INSTALL.md` for Cursor. Use only `penpot-foundations`, `penpot-component-factory`, `penpot-build-screen`, and `penpot-audit-accessibility`.

**Step 6.** Ask the agent which Penpot file is open. Expected: `LCA Speed Journal mockups`. If the answer is empty, the plugin is not connected. Stop.

**Gate:** Mark "Penpot connected" approved on the canvas.

---

## Phase 0 — safety

No mockup. Ship before any visual work.

### Task 0.1: Fail closed when the PIN is unset

**Files:**
- Create: `src/lib/coach-pin.ts`
- Create: `src/lib/coach-pin.test.ts`
- Modify: `src/lib/auth.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { resolveCoachPin } from "./coach-pin";

describe("resolveCoachPin", () => {
  it("returns null when the env value is missing", () => {
    expect(resolveCoachPin(undefined)).toBeNull();
  });

  it("returns null when the env value is blank", () => {
    expect(resolveCoachPin("  ")).toBeNull();
  });

  it("returns the trimmed pin when it is set", () => {
    expect(resolveCoachPin(" 4821 ")).toBe("4821");
  });
});
```

**Step 2: Run the test**

Run: `npx vitest run src/lib/coach-pin.test.ts`

Expected: FAIL, `resolveCoachPin` is not defined.

**Step 3: Implement**

```ts
export function resolveCoachPin(envValue: string | undefined): string | null {
  const pin = envValue?.trim() ?? "";
  return pin.length > 0 ? pin : null;
}
```

In `src/lib/auth.ts`, replace `process.env.COACH_PIN ?? "1234"` with `resolveCoachPin(process.env.COACH_PIN)`. If that returns null, `authorize` returns null.

**Step 4: Run the test**

Run: `npx vitest run src/lib/coach-pin.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/coach-pin.ts src/lib/coach-pin.test.ts src/lib/auth.ts
git commit -m "fix: reject coach login when COACH_PIN is unset"
```

### Task 0.2: Stop showing exception text and env names

**Files:**
- Create: `src/lib/public-error.ts`
- Create: `src/lib/public-error.test.ts`
- Modify: `src/app/data-entry/page.tsx` (`DataEntryError`)
- Modify the athletes page error panel the same way. Search for `NEXTAUTH_SECRET` and the athletes error string before editing.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { coachVisibleError } from "./public-error";

describe("coachVisibleError", () => {
  it("does not include the exception or env names", () => {
    const text = coachVisibleError();
    expect(text).not.toMatch(/NEXTAUTH|POSTGRES|secret/i);
    expect(text.length).toBeGreaterThan(10);
  });
});
```

**Step 2: Run** `npx vitest run src/lib/public-error.test.ts` — expected FAIL.

**Step 3: Implement** a fixed sentence, for example "This page could not load. Try again, and tell the coach if it keeps failing." Log `err` with `console.error` on the server. Render `coachVisibleError()` in the panel. Remove the paragraph that names `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `POSTGRES_URL`.

**Step 4: Run** the same vitest command — expected PASS.

**Step 5: Commit** `fix: hide server details on coach error panels`.

### Task 0.3: Remove the public roster link and the checkpoint paragraph

**Files:**
- Modify: `src/app/page.tsx` (delete the `API: Athletes` link around the `/api/athletes` href)
- Modify: `src/app/weight-room/page.tsx` (delete the Checkpoint A label and the 4 MB paragraph on the hub; leave the upload screen's 4 MB copy)

**Step 1:** Confirm `/weight-room/scans` still tells the coach the 4 MB limit.

**Step 2:** Edit the two pages. Do not change `GET /api/athletes`.

**Step 3:** Commit `fix: remove roster API link and weight-room build notes`.

### Task 0.4: Record which SQL files production has run

**Files:**
- Create: `scripts/APPLIED.md`

List every file in `scripts/*.sql`. Next to each, leave a blank "Applied on production: yes/no/unknown" for Ross to fill. Do not invent which ones have run.

**Commit** `docs: add a ledger for hand-run SQL scripts`.

**Gate 0:** Mark "Phase 0 safety" approved on the canvas after `npm run test` passes and the Home page no longer links to `/api/athletes`.

---

## Gate A — board and group calendar frames

Do not write calendar or board code until this gate is approved.

### Task A0: Draw the frames

With the Penpot file connected, build these frames in light and dark, at 390px, 1280px, and a 1920px board width:

- Board card: rank, name, mark, PB, trend pill, and the drop-off line copied exactly as `Best 10.42 · Line 11.05 · 3 above`.
- Session menu: `Volleyball W1D2`, a second row with phase text `Competition`, an Other row that is a date plus "Open house".
- New session: group picker including Other, date, optional phase sentence, note. No Preseason dropdown. No week number field.
- Group range editor: one group, years 2023–2027, two ranges in one year for extracurricular.
- Type: Source Sans 3 for labels, Barlow Condensed for the mark and the rank.

**Gate A:** You accept the frames in Penpot, then the `/design-preview` route (Task A6) matches them. Mark "Review A" approved on the canvas. If you reject a frame, change the frame, not the app.

---

## Phase A — board and labels

Start only after Gate A.

### Task A1: Week label from a group's range

**Files:**
- Create: `src/lib/season/label.ts`
- Create: `src/lib/season/label.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { sessionWeekLabel, type GroupRange } from "./label";

const volleyball: GroupRange = {
  group: "volleyball",
  start: "2026-08-17",
  end: "2026-10-23",
};

describe("sessionWeekLabel", () => {
  it("counts D1 as the range start and weeks of seven days", () => {
    const label = sessionWeekLabel({
      group: "volleyball",
      groupLabel: "Volleyball",
      sessionDate: "2026-08-18",
      ranges: [volleyball],
    });
    expect(label).toEqual({ kind: "week", label: "Volleyball W1D2" });
  });

  it("rolls to week 2 on the eighth day", () => {
    const label = sessionWeekLabel({
      group: "volleyball",
      groupLabel: "Volleyball",
      sessionDate: "2026-08-24",
      ranges: [volleyball],
    });
    expect(label).toEqual({ kind: "week", label: "Volleyball W2D1" });
  });

  it("does not number Other", () => {
    const label = sessionWeekLabel({
      group: "other",
      groupLabel: "Other",
      sessionDate: "2026-11-07",
      ranges: [volleyball],
    });
    expect(label.kind).toBe("other");
    expect(label.label).toBe("2026-11-07");
  });

  it("does not borrow another group's range", () => {
    const label = sessionWeekLabel({
      group: "track",
      groupLabel: "Track",
      sessionDate: "2026-08-18",
      ranges: [volleyball],
    });
    expect(label.kind).toBe("uncovered");
  });
});
```

**Step 2:** `npx vitest run src/lib/season/label.test.ts` — expected FAIL.

**Step 3: Implement**

Parse `YYYY-MM-DD` as UTC dates. `days = (session - start) / 86400000`. Week is `Math.floor(days / 7) + 1`. Day is `(days % 7) + 1`. Use the range for that group where `start <= date <= end`. If several match, use the one with the latest start. Other returns the date string and kind `other`. No matching range returns kind `uncovered` and the date string.

**Step 4:** same vitest command — expected PASS.

**Step 5: Commit** `feat: label a session from its group date range`.

### Task A2: Store the group and the ranges

**Files:**
- Create: `scripts/migrate-group-season-ranges.sql`
- Modify: `src/app/api/sessions/route.ts`
- Modify: `src/app/api/sessions/[id]/route.ts`
- Create: `src/app/api/season-ranges/route.ts` (GET public read of ranges, POST coach-only)

SQL, applied by hand and then marked in `scripts/APPLIED.md`:

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hugo_group text;

CREATE TABLE IF NOT EXISTS group_season_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hugo_group text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  CHECK (end_date >= start_date)
);
```

Do not add a CHECK list of group names. Validate against `HUGO_GROUPS` plus `"other"` in the API. `phase` may be an empty string. `phase_week` may be null on new rows. Stop returning 400 for a missing week. A new session requires `hugo_group`.

**Commit** `feat: store a session group and per-group date ranges` after a local insert of one volleyball range and one Other session succeeds.

### Task A3: New session form

**Files:**
- Modify: `src/app/data-entry/SessionForm.tsx`
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`

Replace the phase dropdown and week field with: group select (`HUGO_GROUP_META` labels plus Other), date, optional phase text, note. Show the live `sessionWeekLabel` under the date. Uncovered dates show the date and the sentence "No range covers this day."

**Commit** `feat: create a session by group instead of training phase`.

### Task A4: Board URL and display layout

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx`
- Modify: `src/app/leaderboard/ZoneMark.tsx`

Read `session` from `useSearchParams`. When it is missing and the session list has loaded, replace the URL with the latest session id. Expanding tests for that session stays. Write filter state so Review is off by default. Do not remove the drop-off caption. Set the mark and `ZoneMark` color to the theme foreground. Keep `borderLeftColor` as the zone color.

**Commit** `feat: keep the open session in the board URL`.

### Task A5: Recent session selects the entry form

**Files:**
- Modify: `src/app/data-entry/page.tsx`
- Modify: `src/app/data-entry/EntryForm.tsx`

The recent-session row sets the form's session. Edit remains a link to `/data-entry/session/[id]`. The row label uses `sessionWeekLabel`.

**Commit** `fix: selecting a recent session fills the entry form`.

### Task A6: Fonts and the token preview

**Files:**
- Modify: `src/app/layout.tsx` (Source Sans 3 and Barlow Condensed via `next/font/google`)
- Create: `src/app/design-preview/page.tsx` (coach session required, unlinked from Home)

The preview renders the accepted board card with sample data and the theme toggle. It does not POST.

**Commit** `feat: add the approved type pair and a token preview`.

**Gate A done:** Refresh `/leaderboard?session=<id>` and the same session is still selected. A volleyball date inside its range reads `Volleyball W1D2`. Other reads as a date. The drop-off line is unchanged. Mark "Phase A" approved on the canvas.

---

## Gate B — entry frames

Draw, in Penpot, light and dark:

- Desktop: one test, athletes as rows, Enter moves down the column.
- Phone: the current one-submit form, same session selected.
- New session test picker grouped as Speed, Jump, Agility, Throw, Strength. No list of every metric.

**Gate B:** Accept the frames, match them on `/design-preview`, mark "Review B" on the canvas.

## Phase B — two entry flows

Start only after Gate B.

### Task B1: Desktop grid as a new module

**Files:**
- Create: `src/app/data-entry/EntryGrid.tsx`
- Modify: `src/app/data-entry/DataEntryLayout.tsx`

Render `EntryGrid` when the viewport is at least the width chosen on the accepted frame. Otherwise render the existing `EntryForm`. Both use the session selected in Task A5. The grid posts through the existing `POST /api/entries` path inside `EntryForm`'s save function. Extract that save into `src/app/data-entry/save-entry.ts` if both components need it. Do not delete `EntryForm.tsx`.

Roster for a Hugo group is active athletes in that group. Other keeps the athlete picker.

**Commit** `feat: add a desktop roster grid beside phone entry`.

### Task B2: Grouped test picker

**Files:**
- Modify: `src/lib/metric-utils.ts` only if a category is not already on the metric
- Modify: `src/app/data-entry/SessionForm.tsx`

Replace the full checkbox list with five groups. The session still stores `day_metrics` as metric keys.

**Commit** `feat: pick session tests by category`.

**Gate B done:** On a narrow window, one submit still adds a mark and the board updates. On a wide window, a second athlete in the same test does not require re-picking the metric. Mark "Phase B" on the canvas.

---

## Gate C — packet frame

One Penpot frame of the Team Leaders table, light and dark. Numbers right-aligned. One line of counts instead of three uppercase tiles. Human test names, not `5m_Accel`.

**Gate C:** Accept, preview, mark "Review C".

## Phase C — the packet

### Task C1: Human metric labels

**Files:**
- Create: `src/lib/metric-labels.ts` (map of key to words; do not overwrite `display_name` in `metrics.json` while it copies the key)
- Create: `src/lib/metric-labels.test.ts`
- Modify: `src/app/reporting/team-progress/TeamProgressClient.tsx`
- Modify: `src/app/reporting/ReportingClient.tsx`

Test that `5m_Accel` renders as the written label and that an unknown key falls back to the key.

**Commit** `feat: show written metric names on reports`.

### Task C2: Top athletes floor

**Files:**
- Modify: `src/app/api/reporting/summary/route.ts` around the `topPerformers` sort
- Add a test if a pure function is extracted; otherwise document the minimum count next to the sort

Drop athletes whose `metric_count` is below the floor agreed on the Penpot frame. If the frame removes the table, remove it from `ReportingClient` instead.

**Commit** `fix: stop ranking a one-test athlete as the top performer`.

Export stays the Team Leaders table. Historical stays an analysis page.

**Gate C:** Mark "Phase C" after one exported file shows words and the season label from Task A1.

---

## Gate D — athlete and theme frames

Penpot: search, then one athlete, tabs for marks, notes, attendance, strength. Light and dark phone and desktop. Sign out visible.

**Gate D:** Accept, preview, mark "Review D". Confirm Hugo group plus sport can list lanes before any new membership table. If they cannot, stop and say so. Do not invent a schema in this task.

## Phase D — people

### Task D1: Sign out

Add `signOut` from `next-auth/react` on staff screens, in the same chrome as the theme toggle (`src/app/components/ThemeBar.tsx`), hidden on the public board display layout if the accepted frame says so.

**Commit** `feat: let a shared device sign out`.

### Task D2: Athlete record

**Files:**
- Modify: `src/app/athletes/AthleteRoster.tsx` and the athletes page client

Search or filter by class, team, and active. Add athlete is a button and a short form. Delete stays behind the existing confirm and leaves the roster row. One selected person shows the tabs from the frame.

**Commit** `feat: open one athlete from a searchable roster`.

Token retune for both themes happens in `src/app/globals.css` to match the accepted frame: captions at least 4.5:1, board captions at least 7:1, gold for focus, PB, and rank 1.

**Gate D:** Mark "Phase D".

---

## Gate E — shell frames

Only after Phase A and Phase B have been used on a real session day. Penpot: rail with Board, Log, Athletes, Report, in both themes, phone and desktop. Hidden on the display layout. Weight room is a section under Log, not mixed into testing entry.

**Gate E:** Accept, preview, mark "Review E".

## Phase E — shell

### Task E1: Rail

**Files:**
- Create: `src/app/components/AppRail.tsx`
- Modify: `src/app/components/ThemeBar.tsx`
- Modify: `src/app/page.tsx` so Home redirects or points at Board

Theme control sits in the rail footer and no longer covers the title at 390px.

**Commit** `feat: replace the home directory with four doors`.

Batteries fold into Board and norms fold under Report only if the accepted frame says so. If the frame keeps them as links inside those doors, do that and stop.

**Gate E:** Mark "Phase E". The initiative is complete.

---

## Explicitly not in this plan

Program builder, voice entry, athlete accounts, rewriting the drop-off caption, deleting Historical, locking a theme to the TV, replacing phone entry with the grid, and a performance project aimed at the empty-shell paint time.
