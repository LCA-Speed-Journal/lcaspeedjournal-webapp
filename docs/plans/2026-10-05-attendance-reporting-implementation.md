# Attendance Reporting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a coach-only attendance report that averages weekly headcount and session fill for each Hugo sport, splits those rates by Liberty / Homeschool / Co-Op, maps varsity games onto a season heatmap, and shows the same two rates on each athlete.

**Architecture:** Attendance is computed, not stored. `buildAttendanceReport` is a pure function over roster memberships, weight-room logs, testing dates, a weekly rhythm, session edits, and saved varsity dates. Postgres holds enrollment, rhythms, edits, and games. Bound is a refresh source only. The weight-room attendance page and the athlete page both call `GET /api/weight-room/attendance`.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` from `@/lib/db`), NextAuth via `requireCoachSession`, existing weight-room roster UI.

**Design:** [2026-10-05-attendance-reporting-design.md](./2026-10-05-attendance-reporting-design.md)

**PowerShell:** do not use `&&`. Separate commands with `;`.

**Skills:** @test-driven-development — failing test first, then minimal code. @verification-before-completion before claiming done.

---

### Task 1: Week and schedule helpers

**Files:**
- Create: `src/lib/attendance/dates.ts`
- Test: `src/lib/attendance/dates.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  assertAttendanceRange,
  enumerateDates,
  overlappingWeeks,
  scheduledDates,
} from "./dates";

describe("attendance dates", () => {
  it("rejects a range longer than 366 days", () => {
    expect(assertAttendanceRange("2026-01-01", "2027-01-02")).toEqual({
      ok: false,
      error: "Date range too long",
    });
  });

  it("splits a Mon–Sun week and keeps a partial week that starts Wednesday", () => {
    const weeks = overlappingWeeks("2026-10-07", "2026-10-11");
    expect(weeks).toEqual([
      { start: "2026-10-05", end: "2026-10-11" },
    ]);
  });

  it("schedules Mon/Wed inside the range, drops a cancel, and keeps an add", () => {
    const dates = scheduledDates({
      from: "2026-10-05",
      to: "2026-10-11",
      weekdays: [1, 3],
      edits: [
        { session_date: "2026-10-05", action: "cancel" },
        { session_date: "2026-10-06", action: "add" },
      ],
    });
    expect(dates).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("lists every calendar date in range", () => {
    expect(enumerateDates("2026-10-05", "2026-10-07")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/attendance/dates.test.ts`

Expected: FAIL because `./dates` does not exist.

**Step 3: Write the minimal implementation**

- Parse `YYYY-MM-DD` as UTC noon so the calendar day does not shift.
- Monday = 1 through Sunday = 7.
- `assertAttendanceRange` returns `{ ok: true }` when `from <= to` and the inclusive day count is 366 or less. Otherwise `{ ok: false, error }`. Use `"Date range too long"` and `"from must be on or before to"`.
- `overlappingWeeks` returns each Monday–Sunday week that overlaps `[from, to]`, with `start` and `end` as the week’s Monday and Sunday (even when those fall outside the range).
- `scheduledDates` returns sorted dates inside the range whose weekday is in `weekdays`, minus cancels, plus adds. An add on a rhythm day appears once. A cancel of a non-rhythm day does nothing.
- `enumerateDates` returns each date from `from` through `to`.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/attendance/dates.test.ts`

Expected: PASS

**Step 5: Commit**

```powershell
git add src/lib/attendance/dates.ts src/lib/attendance/dates.test.ts
git commit -m "feat: add attendance week and schedule date helpers"
```

---

### Task 2: Pure attendance report

**Files:**
- Create: `src/lib/attendance/report.ts`
- Test: `src/lib/attendance/report.test.ts`

**Step 1: Write the failing test**

Use this fixture. Volleyball rhythm is Monday and Wednesday. Week of 2026-10-05 is the only overlapping week when the range is that Monday through that Sunday.

- Ada, `liberty`, joined `2026-08-01`, card on Monday.
- Ben, `homeschool`, joined `2026-08-01`, no marks.
- Cam, `coop`, joined `2026-10-08` (Thursday of that week), testing entry on Wednesday.
- Dee, enrollment `null`, joined `2026-08-01`, card on Tuesday (not a scheduled day).

```ts
import { describe, expect, it } from "vitest";
import { buildAttendanceReport } from "./report";

const week = { from: "2026-10-05", to: "2026-10-11" };

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    hugo_group: "volleyball",
    from: week.from,
    to: week.to,
    weekdays: [1, 3],
    edits: [],
    members: [
      { athlete_id: "ada", first_name: "Ada", last_name: "A", enrollment: "liberty", joined_on: "2026-08-01" },
      { athlete_id: "ben", first_name: "Ben", last_name: "B", enrollment: "homeschool", joined_on: "2026-08-01" },
      { athlete_id: "cam", first_name: "Cam", last_name: "C", enrollment: "coop", joined_on: "2026-10-08" },
      { athlete_id: "dee", first_name: "Dee", last_name: "D", enrollment: null, joined_on: "2026-08-01" },
    ],
    present: [
      { athlete_id: "ada", session_date: "2026-10-05" },
      { athlete_id: "cam", session_date: "2026-10-07" },
      { athlete_id: "dee", session_date: "2026-10-06" },
    ],
    games: [],
    ...overrides,
  };
}

describe("buildAttendanceReport", () => {
  it("scores headcount, session fill, splits, and a non-scheduled present mark", () => {
    const report = buildAttendanceReport(baseInput());
    expect(report.scheduled_dates).toEqual(["2026-10-05", "2026-10-07"]);
    expect(report.team.headcount).toEqual({ present: 3, possible: 4, pct: 75 });
    expect(report.team.session_fill).toEqual({ present: 2, possible: 8, pct: 25 });
    expect(report.splits.liberty.headcount.pct).toBe(100);
    expect(report.splits.homeschool.headcount.pct).toBe(0);
    expect(report.splits.coop.session_fill).toEqual({ present: 1, possible: 2, pct: 50 });
    expect(report.unset_count).toBe(1);
    expect(report.days.find((d) => d.date === "2026-10-06")?.count).toBe(1);
    const dee = report.athletes.find((a) => a.athlete_id === "dee");
    expect(dee?.session_rate).toEqual({ present: 0, possible: 2, pct: 0 });
    expect(dee?.week_rate.pct).toBe(100);
  });

  it("counts a card and a testing entry on the same day once", () => {
    const report = buildAttendanceReport(
      baseInput({
        present: [
          { athlete_id: "ada", session_date: "2026-10-05" },
          { athlete_id: "ada", session_date: "2026-10-05" },
        ],
      })
    );
    expect(report.days.find((d) => d.date === "2026-10-05")?.count).toBe(1);
  });

  it("keeps a zero-attendance rhythm day in the denominator", () => {
    const report = buildAttendanceReport(baseInput({ present: [] }));
    expect(report.team.session_fill.possible).toBe(8);
    expect(report.team.session_fill.pct).toBe(0);
    expect(report.team.headcount.pct).toBe(0);
  });

  it("omits a fully cancelled week from session fill and still averages headcount at 0", () => {
    const report = buildAttendanceReport(
      baseInput({
        present: [],
        edits: [
          { session_date: "2026-10-05", action: "cancel" },
          { session_date: "2026-10-07", action: "cancel" },
        ],
      })
    );
    expect(report.team.session_fill.pct).toBeNull();
    expect(report.team.headcount.pct).toBe(0);
  });

  it("leaves a late join out of earlier weeks", () => {
    const report = buildAttendanceReport(
      baseInput({
        from: "2026-09-28",
        to: "2026-10-11",
        present: [{ athlete_id: "cam", session_date: "2026-09-30" }],
      })
    );
    const first = report.weeks[0];
    expect(first.start).toBe("2026-09-28");
    expect(first.roster_ids).not.toContain("cam");
    expect(report.weeks[1].roster_ids).toContain("cam");
  });

  it("marks a saved game and ignores a dismissed one", () => {
    const report = buildAttendanceReport(
      baseInput({
        games: [
          { contest_date: "2026-10-06", dismissed: false },
          { contest_date: "2026-10-07", dismissed: true },
        ],
      })
    );
    expect(report.days.find((d) => d.date === "2026-10-06")?.game).toBe(true);
    expect(report.days.find((d) => d.date === "2026-10-07")?.game).toBe(false);
    expect(report.scheduled_dates).toEqual(["2026-10-05", "2026-10-07"]);
  });

  it("returns null session fill when the sport has no weekdays and no adds", () => {
    const report = buildAttendanceReport(baseInput({ weekdays: [] }));
    expect(report.team.session_fill.pct).toBeNull();
    expect(report.needs_rhythm).toBe(true);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/attendance/report.test.ts`

Expected: FAIL because `buildAttendanceReport` is not defined.

**Step 3: Write the minimal implementation**

Export types and `buildAttendanceReport(input)`.

Rules from the design doc:

- Dedupe `present` by `athlete_id` + `session_date`.
- Week roster: `joined_on <= week.end`.
- Headcount present: roster athletes with any deduped mark on a date inside both the week and `[from, to]`.
- Session-fill present: roster athletes with a mark on a scheduled date in that week. Do not count Dee’s Tuesday in the fill numerator.
- Weekly `pct` is `possible === 0 ? null : (100 * present) / possible`. Round the displayed season percent to one decimal with a half-up rule. `present` and `possible` on the season object are sums of the weeks that had a non-null percent. Season `pct` is the unweighted mean of those weekly percents, not `100 * summedPresent / summedPossible`.
- A week with `possible === 0` for session fill is skipped in that mean. Headcount still includes a roster week with nobody present as 0.
- Splits filter the same week’s roster by `liberty`, `homeschool`, and `coop`. A split week with an empty roster is skipped for both means. `unset_count` is members in the report whose enrollment is null and who appear in at least one week roster.
- Athlete session rate uses scheduled dates on or after the Monday of `joined_on` (the athlete is on the roster for the whole join week, so include that week’s earlier scheduled dates). Week rate uses overlapping weeks where `joined_on <= week.end`.
- `days` is every date from `from` through `to`. `count` is present rostered athletes that day (only athletes already in that day’s week roster). `game` is true when a non-dismissed game matches the date.
- `needs_rhythm` is true when `weekdays` is empty and there is no `add` edit inside the range.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/attendance/report.test.ts src/lib/attendance/dates.test.ts`

Expected: PASS

**Step 5: Commit**

```powershell
git add src/lib/attendance/report.ts src/lib/attendance/report.test.ts
git commit -m "feat: compute weekly attendance rates and heatmap days"
```

---

### Task 3: Migration

**Files:**
- Create: `scripts/migrate-attendance-reporting.sql`

**Step 1: Write the migration**

Follow `scripts/migrate-hugo-groups-2026-fall.sql` for the sport CHECK list. Copy the current `HUGO_GROUPS` values.

```sql
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS enrollment TEXT;
ALTER TABLE athletes DROP CONSTRAINT IF EXISTS athletes_enrollment_check;
ALTER TABLE athletes ADD CONSTRAINT athletes_enrollment_check
  CHECK (enrollment IS NULL OR enrollment IN ('liberty', 'homeschool', 'coop'));

CREATE TABLE IF NOT EXISTS sport_practice_rhythms (
  hugo_group TEXT PRIMARY KEY,
  weekdays SMALLINT[] NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_session_edits (
  hugo_group TEXT NOT NULL,
  session_date DATE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add', 'cancel')),
  PRIMARY KEY (hugo_group, session_date)
);

CREATE TABLE IF NOT EXISTS varsity_contests (
  hugo_group TEXT NOT NULL,
  contest_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('bound', 'manual')),
  bound_key TEXT,
  label TEXT,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (hugo_group, contest_date)
);
```

Seed, using `ON CONFLICT DO NOTHING` so a later coach edit is not overwritten:

- `volleyball` → `{1,3}`
- `soccer` → `{2,5}`
- `xc`, `football`, `womens_tennis`, `womens_soccer` → `{1,4}`

Add the same `hugo_group` CHECK used on `athlete_hugo_memberships` to all three new tables. Do not backfill `enrollment`.

**Step 2: Apply it locally**

Run the SQL against the local database the app already uses. Do not invent a new connection flow. If `POSTGRES_URL` is already how other migrations were applied in this checkout, use that.

**Step 3: Commit**

```powershell
git add scripts/migrate-attendance-reporting.sql
git commit -m "feat: add attendance enrollment, rhythm, and varsity game tables"
```

---

### Task 4: Enrollment on the athlete and the roster

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/api/athletes/[id]/route.ts`
- Modify: `src/app/api/weight-room/rosters/route.ts`
- Modify: `src/app/weight-room/rosters/RostersClient.tsx`

**Step 1: Extend the athlete PATCH**

Add `enrollment` to the `Athlete` type: `"liberty" | "homeschool" | "coop" | null`.

In `PATCH /api/athletes/[id]`, accept `enrollment`. `null` or `""` stores NULL. Any other value must be one of the three or the route returns 400 `"Invalid enrollment"`. Include `enrollment` in the SELECT and RETURNING lists next to `athlete_type`. Keep the existing column-missing fallbacks: if the error mentions `enrollment`, retry without that column so an unmigrated database still loads.

**Step 2: Return enrollment on the roster**

Add `a.enrollment` to the roster GET select in `src/app/api/weight-room/rosters/route.ts`.

**Step 3: Add the roster control**

In `RostersClient`, next to Gender and Grade, add an Enrollment `<select>` with options unset (`""`), Liberty, Homeschool, and Co-Op. On change, PATCH `/api/athletes/${id}` with `{ enrollment }` using the same busy and error pattern as `onGenderChange`. Label it `Enrollment for ${athleteLabel(athlete)}`.

**Step 4: Check types**

Run: `npx tsc --noEmit`

Expected: no new errors in the files above.

**Step 5: Commit**

```powershell
git add src/types/index.ts src/app/api/athletes/[id]/route.ts src/app/api/weight-room/rosters/route.ts src/app/weight-room/rosters/RostersClient.tsx
git commit -m "feat: set Liberty, Homeschool, or Co-Op from the sport roster"
```

---

### Task 5: Rhythm and session-edit APIs

**Files:**
- Create: `src/lib/attendance/store.ts`
- Create: `src/app/api/weight-room/attendance/rhythm/route.ts`
- Create: `src/app/api/weight-room/attendance/sessions/route.ts`

**Step 1: Store helpers**

`src/lib/attendance/store.ts` uses `sql` from `@/lib/db` and `isHugoGroup`.

- `getRhythm(hugoGroup)` returns `number[]` (empty when no row).
- `saveRhythm(hugoGroup, weekdays)` replaces the row. Reject weekdays outside 1–7.
- `listEdits(hugoGroup, from, to)` returns `{ session_date, action }[]`.
- `saveEdit(hugoGroup, sessionDate, action)` upserts `add` or `cancel`.
- `clearEdit(hugoGroup, sessionDate)` deletes that row so the rhythm applies again.

`session_date` must be `YYYY-MM-DD`.

**Step 2: Routes**

Both routes call `requireCoachSession` first and return 401 when `ok` is false.

- `PUT /api/weight-room/attendance/rhythm` body `{ hugo_group, weekdays: number[] }`.
- `PUT /api/weight-room/attendance/sessions` body `{ hugo_group, session_date, action: "add" | "cancel" | "clear" }`.

Invalid group, date, weekday, or action returns 400 with a short `error` string.

**Step 3: Commit**

```powershell
git add src/lib/attendance/store.ts src/app/api/weight-room/attendance/rhythm/route.ts src/app/api/weight-room/attendance/sessions/route.ts
git commit -m "feat: save practice rhythm and per-date session edits"
```

---

### Task 6: Bound parser and game refresh

**Files:**
- Create: `src/lib/attendance/bound.ts`
- Test: `src/lib/attendance/bound.test.ts`
- Create: `src/lib/attendance/bound-fixture.html`
- Create: `src/app/api/weight-room/attendance/games/route.ts`
- Create: `src/app/api/weight-room/attendance/games/refresh/route.ts`
- Modify: `src/lib/attendance/store.ts`

**Step 1: Write the failing parser test**

Put a small HTML fixture in `bound-fixture.html` that includes these visible strings, each with a date:

- `Varsity Football` on `2026-10-02` → `football`
- `VOLLEYBALL, GIRLS Junior Varsity` on `2026-10-05` → ignored
- `VOLLEYBALL, GIRLS` with `Varsity` and `Cancelled` → ignored
- `SOCCER, BOYS 5th grade` → ignored
- `SOCCER, BOYS` with `Varsity` on `2026-10-06` → `soccer`
- `Varsity Tennis, Girls` on `2026-10-08` → `womens_tennis`
- `Varsity Cross Country` on `2026-10-09` → `xc`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBoundContests } from "./bound";

describe("parseBoundContests", () => {
  it("keeps varsity contests and drops other levels and cancellations", () => {
    const html = readFileSync(new URL("./bound-fixture.html", import.meta.url), "utf8");
    const rows = parseBoundContests(html);
    expect(rows.map((r) => `${r.hugo_group}:${r.contest_date}`).sort()).toEqual([
      "football:2026-10-02",
      "soccer:2026-10-06",
      "womens_tennis:2026-10-08",
      "xc:2026-10-09",
    ]);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/attendance/bound.test.ts`

Expected: FAIL

**Step 3: Implement the parser and the live fetch**

`parseBoundContests(html)` returns `{ hugo_group, contest_date, bound_key, label }[]`.

Map only a clear varsity label:

| Match | Sport |
|-------|--------|
| Varsity football, not JV, not C team | `football` |
| Varsity girls volleyball | `volleyball` |
| Varsity boys soccer, not a grade level | `soccer` |
| Varsity girls soccer | `womens_soccer` |
| Varsity cross country | `xc` |
| Varsity girls tennis | `womens_tennis` |
| Varsity boys basketball | `mens_basketball` |
| Varsity girls basketball | `womens_basketball` |
| Varsity nordic or ski | `nordic_ski` |
| Varsity track | `track` |
| Varsity baseball | `baseball` |
| Varsity golf | `golf` |

Skip text that includes `Cancelled`, `Junior Varsity`, `JV`, `C Team`, `MS`, or a grade (`5th`, `8th`). `bound_key` is `${hugo_group}:${contest_date}`.

Before trusting the live site, fetch `https://www.gobound.com/mn/schools/lclassical` once. If the HTML has no contest text, keep the fixture-based parser and have refresh return 502 `"Bound did not return a schedule"` without writing. If the live HTML differs from the fixture, update the fixture from that response and adjust the parser until the test still encodes the table above.

`refreshVarsityContests(hugoGroup)`:

- Parse the page.
- Keep rows for that sport.
- Upsert `source = 'bound'` only where `dismissed` is false.
- Do not delete `source = 'manual'` rows.
- Return `{ saved: number, unmatched: { contest_date, label }[] }` for varsity rows that matched no sport. Unmatched is global on that response, not filtered away.

`POST /api/weight-room/attendance/games` body `{ hugo_group, contest_date, label? }` sets `source = 'manual'` and `dismissed = false`.

`DELETE /api/weight-room/attendance/games?hugo_group&contest_date` sets `dismissed = true`. It does not remove the row.

Both routes require a coach session.

**Step 4: Run the parser test**

Run: `npx vitest run src/lib/attendance/bound.test.ts`

Expected: PASS

**Step 5: Commit**

```powershell
git add src/lib/attendance/bound.ts src/lib/attendance/bound.test.ts src/lib/attendance/bound-fixture.html src/lib/attendance/store.ts src/app/api/weight-room/attendance/games/route.ts src/app/api/weight-room/attendance/games/refresh/route.ts
git commit -m "feat: refresh and manually edit saved varsity game dates"
```

---

### Task 7: Report read API

**Files:**
- Modify: `src/lib/attendance/store.ts`
- Create: `src/app/api/weight-room/attendance/route.ts`

**Step 1: Load inputs**

Add `loadAttendanceInput(hugoGroup, from, to)`:

- Members from `athlete_hugo_memberships` joined to `athletes`. `joined_on` is `created_at` converted to a `YYYY-MM-DD` in `America/Chicago`.
- Card dates: `SELECT DISTINCT athlete_id, session_date FROM session_logs WHERE hugo_group = $1 AND session_date BETWEEN $2 AND $3`.
- Testing dates: reuse the filter in `loadTeamJournalAttendance` (`entries` join `sessions`, skip `origin = 'weight_room'`, athlete is on that sport). Map those rows into the same `{ athlete_id, session_date }` list. The pure function dedupes.
- Rhythm, edits, and non-dismissed plus dismissed games inside the range.

**Step 2: GET route**

`GET /api/weight-room/attendance?hugo_group&from&to`

- Coach session required.
- `isHugoGroup` and `assertAttendanceRange`.
- Respond `{ data: buildAttendanceReport(...) }`.
- On database failure, 500 `{ error: "Failed to load attendance" }`.

**Step 3: Commit**

```powershell
git add src/lib/attendance/store.ts src/app/api/weight-room/attendance/route.ts
git commit -m "feat: serve the computed sport attendance report"
```

---

### Task 8: Attendance page

**Files:**
- Create: `src/app/weight-room/attendance/page.tsx`
- Create: `src/app/weight-room/attendance/AttendanceClient.tsx`
- Modify: `src/app/weight-room/page.tsx`

**Step 1: Gate the page**

`page.tsx` matches `src/app/weight-room/rosters/page.tsx`: `getServerSession`, redirect to `/login?callbackUrl=/weight-room/attendance`, render the client.

Add a hub link in `src/app/weight-room/page.tsx` labeled `Attendance`, placed after Reports.

**Step 2: Client behavior**

Use SWR against the GET route. Controls:

- Sport `<select>` of `HUGO_GROUPS`.
- From and to dates. Default from to the Monday of the current week and to to today, both as `YYYY-MM-DD`.
- On a successful load, write `localStorage` key `attendance-range:v1:<hugoGroup>` as `{ from, to }`. Wrap storage in try/catch.
- Weekday checkboxes. Saving calls the rhythm PUT.
- When `needs_rhythm` is true, show “Set practice days to calculate session fill.” Headcount still renders.
- Session list: each scheduled date can be cancelled. A date field can add a day. Clear restores the rhythm.
- Games: list saved dates with Bound or Manual. Delete calls DELETE. Add date calls POST. Refresh calls the refresh POST. Show `unmatched` from that response with an “Add this date” button that POSTs a manual game. If refresh fails, show the error and leave the current game list on screen.
- Averages: team headcount and session fill, then Liberty, Homeschool, and Co-Op. Show `present / possible` and the percent. Null percent renders as an em dash. Show `unset_count` when it is greater than 0.
- Athlete table: name, enrollment, session rate, week rate.
- Heatmap: one cell per `days[]` entry. Text is `count`. A game cell gets a visible “Game” label, not color alone.

Follow the existing dark surface, border, and accent classes used on the roster page. No new chart library.

**Step 3: Verify in the browser**

With `npm run dev` already running, sign in as a coach and open `/weight-room/attendance`.

- Change sport and dates and confirm the request includes those query params.
- Save a weekday, cancel a day, add a day, add a game, dismiss it, and refresh. Each control should survive a reload.
- Confirm a 400-day range shows the API error and does not replace the last good report with an empty grid.

**Step 4: Commit**

```powershell
git add src/app/weight-room/attendance/page.tsx src/app/weight-room/attendance/AttendanceClient.tsx src/app/weight-room/page.tsx
git commit -m "feat: add the sport attendance report page"
```

---

### Task 9: Athlete rates

**Files:**
- Create: `src/app/athletes/AttendanceSection.tsx`
- Modify: `src/app/athletes/AthleteDashboard.tsx`

**Step 1: Section**

Place `<AttendanceSection athleteId={athleteId} />` immediately after `<HugoTeamsSection />`.

The section loads `/api/athletes/${id}` for `hugo_groups` (the same payload Hugo teams already uses). For each group, read `attendance-range:v1:<group>`. If the key is missing, show the sport name and “Pick dates on the Attendance page.” If it is present, SWR `GET /api/weight-room/attendance` for that group and range, find this athlete, and show session rate and week rate as `present / possible` plus percent.

**Step 2: Verify in the browser**

Open an athlete who is on a sport you just viewed on the Attendance page. The rates match that report’s row for the same dates. An athlete with two sports shows two blocks. A sport you have not opened yet asks for dates instead of inventing a range.

**Step 3: Commit**

```powershell
git add src/app/athletes/AttendanceSection.tsx src/app/athletes/AthleteDashboard.tsx
git commit -m "feat: show season attendance rates on the athlete page"
```

---

### Task 10: Final check

**Step 1: Run the attendance tests**

Run: `npx vitest run src/lib/attendance`

Expected: PASS

**Step 2: Run the type check**

Run: `npx tsc --noEmit`

Expected: no errors from the new files.

**Step 3: Browser pass**

Repeat the Task 8 and Task 9 checks on one fall sport that already has a rhythm. Confirm an unset athlete is in the team headcount and absent from the three splits.

Do not claim the feature is done until those three checks have been run.
