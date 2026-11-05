# Guest Athletes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a coach log an athlete on another sport's weight-room card or speed-testing session, show them as a guest that day, and keep them out of the host sport's season totals.

**Architecture:** Guest is derived, never stored. Speed-testing entries gain a nullable `context_hugo_group` (the sport selected at save time). A row is a guest when that sport is set and the athlete is not in `athlete_hugo_memberships` for it. Weight-room logs keep the card's `hugo_group`; a guest is a logged athlete who is not on that card's roster. Season lift, ISO, and weight-room team totals drop logs whose athlete is outside the roster. The athlete's own report is unchanged.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates), existing Hugo membership helpers.

**Design:** `docs/plans/2026-10-06-guest-athletes-design.md`

**Workspace:** Implement on the current checkout. Do not create a git worktree.

---

### Task 1: Nullable context column

**Files:**
- Create: `scripts/migrate-guest-context.sql`

**Step 1: Write the migration**

```sql
-- Sport selected on the speed-testing form when the entry was saved.
-- NULL means All sports, or an entry saved before this column existed.
-- Guest is NOT stored. Readers compare this value to athlete_hugo_memberships.

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS context_hugo_group TEXT;
```

No CHECK constraint in SQL. The app validates with `isHugoGroup` on write. Existing rows stay NULL.

**Step 2: Run it on the local database**

Run the script the same way other files in `scripts/` are applied (psql or the project's usual migrate command against `POSTGRES_URL`).

Expected: column exists; `SELECT context_hugo_group FROM entries LIMIT 1` returns NULL for old rows.

**Step 3: Commit**

```bash
git add scripts/migrate-guest-context.sql
git commit -m "Add nullable context sport on speed-testing entries."
```

---

### Task 2: Accept the context sport on entry save

**Files:**
- Create: `src/lib/guest-athletes.ts`
- Test: `src/lib/guest-athletes.test.ts`
- Modify: `src/app/api/entries/route.ts` (POST insert, around the body parse and the `INSERT INTO entries`)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseContextHugoGroup } from "./guest-athletes";

describe("parseContextHugoGroup", () => {
  it("allows null and blank", () => {
    expect(parseContextHugoGroup(undefined)).toEqual({ ok: true, value: null });
    expect(parseContextHugoGroup(null)).toEqual({ ok: true, value: null });
    expect(parseContextHugoGroup("")).toEqual({ ok: true, value: null });
  });

  it("accepts a Hugo sport", () => {
    expect(parseContextHugoGroup("soccer")).toEqual({ ok: true, value: "soccer" });
  });

  it("rejects an unknown sport", () => {
    expect(parseContextHugoGroup("curling")).toEqual({
      ok: false,
      error: "Invalid context_hugo_group",
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: FAIL with `parseContextHugoGroup` not defined.

**Step 3: Write the parser and send it on insert**

```ts
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";

export function parseContextHugoGroup(
  value: unknown
): { ok: true; value: HugoGroup | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (isHugoGroup(value)) return { ok: true, value };
  return { ok: false, error: "Invalid context_hugo_group" };
}
```

In `POST` in `src/app/api/entries/route.ts`, after the required-field check:

```ts
const parsedContext = parseContextHugoGroup(body.context_hugo_group);
if (!parsedContext.ok) {
  return NextResponse.json({ error: parsedContext.error }, { status: 400 });
}
const contextHugoGroup = parsedContext.value;
```

Add `context_hugo_group` to the column list and `${contextHugoGroup}` to `VALUES`. Every parsed row from that request gets the same value. Do not change `GET`.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/guest-athletes.ts src/lib/guest-athletes.test.ts src/app/api/entries/route.ts
git commit -m "Store the speed-testing sport on each new entry."
```

---

### Task 3: Mark guests on the session leaderboard

**Files:**
- Modify: `src/lib/guest-athletes.ts`
- Modify: `src/lib/guest-athletes.test.ts`
- Modify: `src/types/index.ts` (`LeaderboardRow`)
- Modify: `src/app/api/leaderboard/route.ts` (both `best` CTEs, and the membership fetch)
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (`LeaderboardCard` name block, around the `displayName` span)

**Step 1: Write the failing test**

```ts
import { guestFields } from "./guest-athletes";

describe("guestFields", () => {
  it("is a guest when the saved sport is not one of their memberships", () => {
    expect(guestFields("soccer", ["mens_basketball"])).toEqual({
      guest: true,
      home_sport_label: "Men's Basketball",
    });
  });

  it("joins every home sport", () => {
    expect(guestFields("volleyball", ["xc", "track"]).home_sport_label).toBe(
      "XC, Track"
    );
  });

  it("is not a guest for a member, a null context, or an unknown context", () => {
    expect(guestFields("soccer", ["soccer"]).guest).toBe(false);
    expect(guestFields(null, ["mens_basketball"]).guest).toBe(false);
    expect(guestFields("curling", ["mens_basketball"]).guest).toBe(false);
  });

  it("still marks Guest when they have no memberships", () => {
    expect(guestFields("soccer", [])).toEqual({
      guest: true,
      home_sport_label: null,
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: FAIL with `guestFields` not defined.

**Step 3: Implement the label and attach it on the live board**

```ts
import { HUGO_GROUP_META, isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";

export function guestFields(
  contextHugoGroup: string | null | undefined,
  membershipGroups: string[]
): { guest: boolean; home_sport_label: string | null } {
  if (!isHugoGroup(contextHugoGroup)) {
    return { guest: false, home_sport_label: null };
  }
  if (membershipGroups.includes(contextHugoGroup)) {
    return { guest: false, home_sport_label: null };
  }
  const labels = membershipGroups
    .filter((group): group is HugoGroup => isHugoGroup(group))
    .map((group) => HUGO_GROUP_META[group].label);
  return {
    guest: true,
    home_sport_label: labels.length > 0 ? labels.join(", ") : null,
  };
}
```

On `LeaderboardRow` in `src/types/index.ts` add:

```ts
guest?: boolean;
home_sport_label?: string | null;
```

In `src/app/api/leaderboard/route.ts`, add `e.context_hugo_group` to the `SELECT` inside both `best` CTEs (the ascending branch and the descending branch), and add `context_hugo_group` to the outer `SELECT` and the `Row` type (`string | null`).

After `leaderboardRows` is built, load memberships for those athlete ids. Reuse that result for zone attachment instead of querying memberships a second time inside the zone `try`. Apply `guestFields` per row from `context_hugo_group` plus that athlete's membership groups. If the membership query throws, log it and return the rows with no `guest` field. Rank math stays as it is. Do not change `src/app/api/leaderboard/historical/route.ts`.

In `LeaderboardCard`, under the name span, when `row.guest` is true render a line:

```tsx
{row.guest ? (
  <span className="truncate text-xs text-foreground-muted">
    {row.home_sport_label ? `Guest · ${row.home_sport_label}` : "Guest"}
  </span>
) : null}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/guest-athletes.ts src/lib/guest-athletes.test.ts src/types/index.ts src/app/api/leaderboard/route.ts src/app/leaderboard/LeaderboardClient.tsx
git commit -m "Label guest athletes on the session leaderboard."
```

---

### Task 4: Other-sports pick on speed testing

**Files:**
- Modify: `src/lib/guest-athletes.ts`
- Modify: `src/lib/guest-athletes.test.ts`
- Modify: `src/app/data-entry/EntryForm.tsx` (athlete dropdown around lines 199–214 and 617–666, sport `onChange` around 511–521, POST body around 401–406)

**Step 1: Write the failing test**

```ts
import {
  contextHugoGroupForSave,
  otherSportMatches,
  shouldClearAthleteOnSportChange,
} from "./guest-athletes";

const soccer = { id: "s", first_name: "Sue", last_name: "Soccer", hugo_groups: ["soccer"] };
const ball = { id: "b", first_name: "Sam", last_name: "Ball", hugo_groups: ["mens_basketball"] };

describe("otherSportMatches", () => {
  it("returns nothing until a sport is selected and the coach has typed", () => {
    expect(otherSportMatches([soccer, ball], "", "sam")).toEqual([]);
    expect(otherSportMatches([soccer, ball], "soccer", "")).toEqual([]);
    expect(otherSportMatches([soccer, ball], "soccer", "   ")).toEqual([]);
  });

  it("returns name matches outside the selected sport", () => {
    expect(otherSportMatches([soccer, ball], "soccer", "sam")).toEqual([ball]);
    expect(otherSportMatches([soccer, ball], "soccer", "sue")).toEqual([]);
  });
});

describe("context and sport changes", () => {
  it("saves the selected sport and saves null for All sports", () => {
    expect(contextHugoGroupForSave("soccer")).toBe("soccer");
    expect(contextHugoGroupForSave("")).toBeNull();
  });

  it("clears a pick that is outside the new sport and keeps All sports", () => {
    expect(shouldClearAthleteOnSportChange(ball, "volleyball")).toBe(true);
    expect(shouldClearAthleteOnSportChange(ball, "mens_basketball")).toBe(false);
    expect(shouldClearAthleteOnSportChange(ball, "")).toBe(false);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: FAIL with `otherSportMatches` not defined.

**Step 3: Implement the helpers and wire the form**

```ts
import { athleteHasHugoGroup, type HugoTeamAthlete } from "@/lib/weight-room/hugo-memberships";
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";

export function otherSportMatches<T extends HugoTeamAthlete & { first_name: string; last_name: string }>(
  athletes: T[],
  sport: string,
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!sport || !q) return [];
  return athletes.filter((athlete) => {
    if (athleteHasHugoGroup(athlete, sport)) return false;
    const name = `${athlete.first_name} ${athlete.last_name}`.toLowerCase();
    return name.includes(q);
  });
}

export function contextHugoGroupForSave(sport: string): HugoGroup | null {
  return isHugoGroup(sport) ? sport : null;
}

export function shouldClearAthleteOnSportChange(
  athlete: HugoTeamAthlete,
  nextSport: string
): boolean {
  if (!nextSport) return false;
  return !athleteHasHugoGroup(athlete, nextSport);
}
```

In `EntryForm.tsx`:

- Keep `athletesInSport` / `filteredAthletes` as the in-sport list.
- `const otherAthletes = otherSportMatches(athletes, sportFilter, athleteQuery)`.
- Keyboard option order: in-sport matches, then other-sport matches, then the existing Add row. `pickerOptionCount` must include `otherAthletes.length`. Arrow keys and Enter use that combined list. The "Other sports" heading is not an option.
- When both lists are empty, keep the "No athletes match" row. When only the other list has rows, omit that message and show the heading plus those rows.
- On sport change, clear the selected athlete when `shouldClearAthleteOnSportChange` is true. Switching to All sports leaves the pick in place.
- Derive the Guest suffix at render from the current `sportFilter` and the selected athlete. Do not bake it into state. Suffix is `Guest · {sport labels}` using the same label join as `guestFields`, shown only when `sportFilter` is set and the athlete is outside it.
- POST body adds `context_hugo_group: contextHugoGroupForSave(sportFilter)`.

Quick-add stays the last row. Do not put newly typed unknown names into Other sports.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/guest-athletes.test.ts src/lib/quick-athlete.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/guest-athletes.ts src/lib/guest-athletes.test.ts src/app/data-entry/EntryForm.tsx
git commit -m "Let speed testing pick an athlete from another sport."
```

---

### Task 5: Add a guest on the weight-room card

**Files:**
- Modify: `src/lib/guest-athletes.ts`
- Modify: `src/lib/guest-athletes.test.ts`
- Modify: `src/app/api/weight-room/manual-log/route.ts` (`GET` returns `guests`)
- Modify: `src/app/weight-room/log/ManualLogClient.tsx` (payload type, `selectedAthletes` around line 416, roster checklist around line 1021)

**Step 1: Write the failing test**

```ts
import { loggedGuests, searchGuests } from "./guest-athletes";

const roster = [{ id: "s", first_name: "Sue", last_name: "Soccer" }];
const sam = { id: "b", first_name: "Sam", last_name: "Ball", hugo_groups: ["mens_basketball"] };
const sue = { id: "s", first_name: "Sue", last_name: "Soccer", hugo_groups: ["soccer"] };

describe("weight-room guests", () => {
  it("returns logged athletes who are not on the roster", () => {
    expect(loggedGuests(roster, ["s", "b", "b"], [sue, sam])).toEqual([sam]);
  });

  it("searches active athletes outside the card sport, skipping people already listed", () => {
    expect(searchGuests([sue, sam], "soccer", new Set(["s"]), "")).toEqual([]);
    expect(searchGuests([sue, sam], "soccer", new Set(["s"]), "sam")).toEqual([sam]);
    expect(searchGuests([sue, sam], "soccer", new Set(["b"]), "sam")).toEqual([]);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: FAIL with `loggedGuests` not defined.

**Step 3: Implement lookup, API, and the Add guest box**

```ts
export function loggedGuests<T extends { id: string }>(
  roster: { id: string }[],
  loggedAthleteIds: string[],
  directory: T[]
): T[] {
  const onRoster = new Set(roster.map((athlete) => athlete.id));
  const byId = new Map(directory.map((athlete) => [athlete.id, athlete]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of loggedAthleteIds) {
    if (onRoster.has(id) || seen.has(id)) continue;
    const athlete = byId.get(id);
    if (!athlete) continue;
    seen.add(id);
    out.push(athlete);
  }
  return out;
}

export function searchGuests<T extends HugoTeamAthlete & { id: string; first_name: string; last_name: string }>(
  athletes: T[],
  hugoGroup: string,
  excludeIds: Set<string>,
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return athletes.filter((athlete) => {
    if (excludeIds.has(athlete.id)) return false;
    if (athleteHasHugoGroup(athlete, hugoGroup)) return false;
    const name = `${athlete.first_name} ${athlete.last_name}`.toLowerCase();
    return name.includes(q);
  });
}
```

`GET /api/weight-room/manual-log`: after `logs` are grouped, collect athlete ids on those logs that are not in `roster`. Load those athletes (include inactive; a saved guest must reopen) plus their `athlete_hugo_memberships`. Return them as `guests: { id, first_name, last_name, hugo_groups }[]`. Roster athletes stay in `roster` only.

`ManualLogClient.tsx`:

- Extend the SWR payload type with `guests`.
- `selectedAthletes` resolves each selected id from `roster`, then `guests`, then a local `addedGuests` list. A guest id that is only in `selectedAthleteIds` must still produce a column. Today the `roster.find` filter drops them, so their sets never save.
- The existing effect that pre-checks `logs.map(l => l.athlete_id)` already includes guest ids. Leave it. Do not delete a log on uncheck. Save still posts only the checked athletes.
- Under the roster checklist, add a search labeled Add guest. Load `/api/athletes?active=true` for the directory. Results come from `searchGuests`, excluding roster ids and ids already selected. Empty query shows no rows. No matches: "No athletes match". If that fetch errors, show "Could not load athletes" and leave the roster checklist usable.
- Choosing a result appends them to `addedGuests` and selects their id. Checkbox and column header show the name, then a second line `Guest · {home sport labels}`.
- Do not change scan review.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/guest-athletes.test.ts src/lib/weight-room/manual-log.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/guest-athletes.ts src/lib/guest-athletes.test.ts src/app/api/weight-room/manual-log/route.ts src/app/weight-room/log/ManualLogClient.tsx
git commit -m "Add guest athletes on a weight-room card."
```

---

### Task 6: Keep guests out of host-sport season totals

**Files:**
- Modify: `src/lib/guest-athletes.ts`
- Modify: `src/lib/guest-athletes.test.ts`
- Modify: `src/lib/team-progress/build-payload.ts` (lift and ISO actuals, around lines 123–127)
- Modify: `src/lib/weight-room/report-load.ts` (`loadTeamAggregateInput` only)

**Step 1: Write the failing test**

```ts
import { filterReportSourceToMembers, idsOnRoster } from "./guest-athletes";

describe("season member filter", () => {
  it("drops logs, their results, and athlete rows outside the roster", () => {
    const source = {
      logs: [
        { id: "log-member", athlete_id: "sue", template_id: "t", session_date: "2026-10-06", hugo_group: "soccer" },
        { id: "log-guest", athlete_id: "sam", template_id: "t", session_date: "2026-10-06", hugo_group: "soccer" },
      ],
      results: [
        { session_log_id: "log-member", movement_id: "m", raw_text: "50x5", kind: "load", load: 50, reps: 5, units: "lb" },
        { session_log_id: "log-guest", movement_id: "m", raw_text: "40x5", kind: "load", load: 40, reps: 5, units: "lb" },
      ],
      movements: [],
      athletes: [
        { id: "sue", first_name: "Sue", last_name: "Soccer" },
        { id: "sam", first_name: "Sam", last_name: "Ball" },
      ],
    };
    const filtered = filterReportSourceToMembers(source, new Set(["sue"]));
    expect(filtered.logs.map((log) => log.id)).toEqual(["log-member"]);
    expect(filtered.results.map((row) => row.session_log_id)).toEqual(["log-member"]);
    expect(filtered.athletes.map((athlete) => athlete.id)).toEqual(["sue"]);
  });

  it("builds a roster id set", () => {
    expect(idsOnRoster([{ id: "sue" }, { id: "sam" }])).toEqual(new Set(["sue", "sam"]));
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/guest-athletes.test.ts`

Expected: FAIL with `filterReportSourceToMembers` not defined.

**Step 3: Filter season aggregates only**

```ts
import type { ReportSource } from "@/lib/weight-room/report-load";

export function idsOnRoster(roster: { id: string }[]): Set<string> {
  return new Set(roster.map((athlete) => athlete.id));
}

export function filterReportSourceToMembers(
  source: ReportSource,
  memberIds: Set<string>
): ReportSource {
  const logs = source.logs.filter((log) => memberIds.has(log.athlete_id));
  const logIds = new Set(logs.map((log) => log.id));
  return {
    ...source,
    logs,
    results: source.results.filter((row) => logIds.has(row.session_log_id)),
    athletes: source.athletes.filter((athlete) => memberIds.has(athlete.id)),
  };
}
```

If that import cycle is real (`report-load` already imports `report-aggregate`), type the argument inline as `{ logs, results, movements, athletes }` instead of importing `ReportSource`.

In `build-payload.ts`, `athleteIds` is already the roster. Before `aggregateLiftSeries` and `aggregateIsoRockActuals`:

```ts
const memberIds = new Set(athleteIds);
const memberLifts = liftRows.filter((row) => memberIds.has(row.athlete_id));
const memberIsoLogs = isoLogRows.filter((row) => memberIds.has(row.athlete_id));
```

Pass those filtered arrays in. Leave test rows and F2F rows alone; they are already loaded by roster id.

In `loadTeamAggregateInput`, `loadRoster(opts.hugo_group)` in parallel with the existing loads. Run `filterReportSourceToMembers` on `current` and `previous` before `mergeJournalAttendance`. Do not filter `loadAthleteAggregateInput` or `loadAthleteReportSource`.

Do not change attendance scoring. A card log still counts only for athletes already on that sport's member list.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/guest-athletes.test.ts src/lib/team-progress/lift-aggregate.test.ts src/lib/team-progress/iso-rocks.test.ts src/lib/weight-room/report-aggregate.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/guest-athletes.ts src/lib/guest-athletes.test.ts src/lib/team-progress/build-payload.ts src/lib/weight-room/report-load.ts
git commit -m "Exclude guest logs from host-sport season totals."
```

---

### Task 7: Lock attendance so a non-member present mark does not score

**Files:**
- Modify: `src/lib/attendance/report.test.ts`

**Step 1: Write the test**

`buildAttendanceReport` already scores `members` only. This test locks that. Use `baseInput()` and add a present mark for an id that is not in `members`.

```ts
it("ignores a present mark for someone who is not on the roster", () => {
  const withoutGuest = buildAttendanceReport(baseInput());
  const withGuest = buildAttendanceReport(
    baseInput({
      present: [
        ...baseInput().present,
        { athlete_id: "sam", session_date: "2026-10-05" },
      ],
    })
  );
  expect(withGuest.team).toEqual(withoutGuest.team);
  expect(withGuest.athletes.map((athlete) => athlete.athlete_id)).not.toContain("sam");
});
```

Check the athlete field name on the report result. `report.test.ts` uses `roster_ids` on weeks. Match whatever `buildAttendanceReport` actually returns for the per-athlete list (read the type in `src/lib/attendance/report.ts`). The assertion that matters: team headcount and session fill stay equal to the report without Sam, and Sam is not listed.

**Step 2: Run the test**

Run: `npx vitest run src/lib/attendance/report.test.ts`

Expected: PASS with no change to `report.ts`. If it fails, stop. Do not change attendance math to exclude guests a second time until you see why a non-member is scoring.

**Step 3: Commit**

```bash
git add src/lib/attendance/report.test.ts
git commit -m "Lock attendance so off-roster logs do not change the rate."
```

---

### Task 8: Full test run

**Step 1: Run the suite**

Run: `npm test`

Expected: PASS. Fix failures that this work caused. Leave unrelated failures as they were, and say so.

**Step 2: Manual check**

Migration from Task 1 must already be applied.

- Weight-room log, soccer card: type a basketball athlete, save a set, reload. They show as Guest with Men's Basketball, sets still there. Soccer roster membership unchanged.
- Team progress and the weight-room team report for soccer do not include that athlete. Their athlete report does.
- Speed testing with Soccer selected: type that athlete, save a metric. Session leaderboard shows Guest and their sport. A soccer athlete on the same session has no Guest line.
- Switch the sport dropdown to Volleyball before save: the basketball pick clears. Switch to All sports: the pick stays, and the saved entry has a null context.

---

## Out of scope

Scan-review guest search, a stored guest flag, historical leaderboard Guest labels, and adding the athlete to the host sport.
