# Session Drop-off Line Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On practice metrics the coach already logs, show today's best and a 6% quality line on the data-entry form and the live leaderboard card, plus how many attempts are still on the good side of that line.

**Architecture:** A pure function walks attempts in entry order, keeps the best as the initial, and sets the line from that best. Time (units `s`) puts the line above the best. Every other unit puts the line below the best. The live leaderboard route attaches the result onto the existing row. The entry form computes the same result from the session's saved entries. Rank, PB/SB, and the last-session trend pill stay as they are. No schema change.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates), SWR, existing `LeaderboardRow` in `src/types/index.ts`.

**Product source:** `Coaching/Projects/LCA-Speed_Vercel/docs/plans/2026-10-28-hammer-dropoff-features.md` in the Obsidian vault, items 1 and 2 only. Do not build stop reasons, the speed-power lane, flags, payback targets, the depth gate, or bar-velocity logging in this plan.

---

## Rules the implementer must not break

- Fatigue percent is **6**. Do not reuse `TIME_NEUTRAL_BAND` (0.8) or `DISTANCE_NEUTRAL_BAND` (1.5) from `src/app/api/leaderboard/route.ts`.
- The line uses the **rounded** value the coach will read (2 decimal places). Counts use that same rounded line.
- A new best resets the line. An earlier slower or shorter attempt does not count as "crossed" if a later attempt is the best. `crossedDropoff` is true only when a later, non-best attempt falls past the line that existed at that moment.
- `attemptsAboveLine` counts attempts still on the good side of the **final** line, including the best. The line is inclusive: equal to the line still counts.
- Ignore non-finite and non-positive values.
- Only the metric keys in Task 2 get the line. `24/28s_Drill`, `3x200m`, `40yd_Dash`, depth jumps, and `MaxVelocity` do not.
- There is no React component test runner in this repo (no Testing Library). UI tasks call tested helpers. Do not add a component-test dependency.

Direction follows the leaderboard: units `s` means lower is better (`sortAsc` in `src/app/api/leaderboard/route.ts` around line 152). `10-20m_Split` displays mph, so its line sits below the best, same as a jump.

---

### Task 1: Drop-off math

**Files:**
- Create: `src/lib/dropoff/summarize.ts`
- Test: `src/lib/dropoff/summarize.test.ts`

**Step 1: Write the failing test**

Create `src/lib/dropoff/summarize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dropoffLine, summarizeDropoff } from "./summarize";

describe("dropoffLine", () => {
  it("puts a time line above the best", () => {
    expect(dropoffLine(10.42, "time")).toBe(11.05);
    expect(dropoffLine(1.7, "time")).toBe(1.8);
  });

  it("puts a score line below the best", () => {
    expect(dropoffLine(28.5, "score")).toBe(26.79);
  });
});

describe("summarizeDropoff", () => {
  it("returns null when there is no positive attempt", () => {
    expect(summarizeDropoff([], "time")).toBeNull();
    expect(summarizeDropoff([0, Number.NaN], "score")).toBeNull();
  });

  it("counts a single attempt as above the line and not crossed", () => {
    expect(summarizeDropoff([1.7], "time")).toEqual({
      initial: 1.7,
      dropoffLine: 1.8,
      dropoffPercent: 6,
      attemptsAboveLine: 1,
      crossedDropoff: false,
    });
  });

  it("marks a later time that is slower than the line", () => {
    const summary = summarizeDropoff([1.7, 1.75, 1.85], "time");
    expect(summary).toMatchObject({
      initial: 1.7,
      dropoffLine: 1.8,
      attemptsAboveLine: 2,
      crossedDropoff: true,
    });
  });

  it("marks a later jump that is shorter than the line", () => {
    const summary = summarizeDropoff([28.5, 27, 26], "score");
    expect(summary).toMatchObject({
      initial: 28.5,
      dropoffLine: 26.79,
      attemptsAboveLine: 2,
      crossedDropoff: true,
    });
  });

  it("resets the line on a new best and does not call the old attempt a cross", () => {
    const summary = summarizeDropoff([2, 1.7], "time");
    expect(summary).toMatchObject({
      initial: 1.7,
      dropoffLine: 1.8,
      attemptsAboveLine: 1,
      crossedDropoff: false,
    });
  });

  it("keeps the crossed flag after a later attempt comes back inside the line", () => {
    const summary = summarizeDropoff([1.7, 1.9, 1.72], "time");
    expect(summary).toMatchObject({
      attemptsAboveLine: 2,
      crossedDropoff: true,
    });
  });

  it("treats a value equal to the line as still good", () => {
    const summary = summarizeDropoff([1.7, 1.8], "time");
    expect(summary).toMatchObject({
      attemptsAboveLine: 2,
      crossedDropoff: false,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/summarize.test.ts`

Expected: FAIL with `summarizeDropoff` / `dropoffLine` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/dropoff/summarize.ts`:

```ts
export const DROPOFF_PERCENT = 6;

export type DropoffDirection = "time" | "score";

export type DropoffSummary = {
  initial: number;
  dropoffLine: number;
  dropoffPercent: number;
  attemptsAboveLine: number;
  crossedDropoff: boolean;
};

export function directionFromUnits(units: string): DropoffDirection {
  return units.trim().toLowerCase() === "s" ? "time" : "score";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function dropoffLine(
  initial: number,
  direction: DropoffDirection,
  percent = DROPOFF_PERCENT
): number {
  const factor = percent / 100;
  const raw = direction === "time" ? initial * (1 + factor) : initial * (1 - factor);
  return round2(raw);
}

function isBetter(value: number, initial: number, direction: DropoffDirection): boolean {
  return direction === "time" ? value < initial : value > initial;
}

function onGoodSide(value: number, line: number, direction: DropoffDirection): boolean {
  return direction === "time" ? value <= line : value >= line;
}

export function summarizeDropoff(
  attempts: number[],
  direction: DropoffDirection,
  percent = DROPOFF_PERCENT
): DropoffSummary | null {
  const values = attempts.filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return null;

  let initial = values[0];
  let line = dropoffLine(initial, direction, percent);
  let crossedDropoff = false;

  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    if (isBetter(value, initial, direction)) {
      initial = value;
      line = dropoffLine(initial, direction, percent);
      continue;
    }
    if (!onGoodSide(value, line, direction)) crossedDropoff = true;
  }

  let attemptsAboveLine = 0;
  for (const value of values) {
    if (onGoodSide(value, line, direction)) attemptsAboveLine += 1;
  }

  return {
    initial,
    dropoffLine: line,
    dropoffPercent: percent,
    attemptsAboveLine,
    crossedDropoff,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dropoff/summarize.test.ts`

Expected: PASS (7 tests).

**Step 5: Commit**

```bash
git add src/lib/dropoff/summarize.ts src/lib/dropoff/summarize.test.ts
git commit -m "feat: add session drop-off line math"
```

---

### Task 2: Which metrics get the line

**Files:**
- Create: `src/lib/dropoff/metrics.ts`
- Test: `src/lib/dropoff/metrics.test.ts`

Fly-10 in this app is the registry key `10-20m_Split` (a 10 m fly window, display unit mph). There is no `Fly10` key. Do not add one.

**Step 1: Write the failing test**

Create `src/lib/dropoff/metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDropoffMetric } from "./metrics";

describe("isDropoffMetric", () => {
  it("includes short accel, sleds, the 10m fly, standing vertical, and broad", () => {
    for (const key of [
      "5m_Accel",
      "10m_Accel",
      "15m_Accel",
      "20m_Accel",
      "10m_Light-Sled",
      "10m_Medium-Sled",
      "20m_Light-Sled",
      "20m_Medium-Sled",
      "10-20m_Split",
      "Vertical Jump",
      "Standing-Broad",
    ]) {
      expect(isDropoffMetric(key)).toBe(true);
    }
  });

  it("excludes race-model, testing, and depth metrics", () => {
    for (const key of [
      "30m_Accel",
      "40yd_Dash",
      "24/28s_Drill",
      "3x200m",
      "Depth-Vertical_18",
      "MaxVelocity",
      "Paused-Vertical",
    ]) {
      expect(isDropoffMetric(key)).toBe(false);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/metrics.test.ts`

Expected: FAIL with `isDropoffMetric` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/dropoff/metrics.ts`:

```ts
const DROPOFF_METRIC_KEYS = new Set<string>([
  "5m_Accel",
  "10m_Accel",
  "15m_Accel",
  "20m_Accel",
  "10m_Light-Sled",
  "10m_Medium-Sled",
  "20m_Light-Sled",
  "20m_Medium-Sled",
  "10-20m_Split",
  "Vertical Jump",
  "Standing-Broad",
]);

export function isDropoffMetric(metricKey: string): boolean {
  return DROPOFF_METRIC_KEYS.has(metricKey);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dropoff/metrics.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/dropoff/metrics.ts src/lib/dropoff/metrics.test.ts
git commit -m "feat: limit the drop-off line to short practice metrics"
```

---

### Task 3: Pick the attempts that belong to one overall mark

The entry form and the session entries table load `GET /api/entries?session_id=`. That payload includes split components. The overall mark is the row with `interval_index` null and `component` null. Order is `created_at`, then `id`. Postgres may return `display_value` as a string, so coerce with `Number`.

**Files:**
- Create: `src/lib/dropoff/attempts.ts`
- Test: `src/lib/dropoff/attempts.test.ts`

**Step 1: Write the failing test**

Create `src/lib/dropoff/attempts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { overallAttemptsFor, type DropoffEntry } from "./attempts";

const base: DropoffEntry = {
  id: "b",
  athlete_id: "a1",
  metric_key: "10m_Accel",
  interval_index: null,
  component: null,
  display_value: 1.8,
  units: "s",
  created_at: "2026-10-28T15:00:00.000Z",
};

describe("overallAttemptsFor", () => {
  it("returns overall rows for one athlete and metric in entry order", () => {
    const entries: DropoffEntry[] = [
      { ...base, id: "late", display_value: "1.90", created_at: "2026-10-28T15:02:00.000Z" },
      { ...base, id: "early", display_value: 1.7, created_at: "2026-10-28T15:01:00.000Z" },
      { ...base, id: "other", athlete_id: "a2", display_value: 1.6 },
      { ...base, id: "split", component: "0-5m", display_value: 0.9 },
      { ...base, id: "jump", metric_key: "Vertical Jump", units: "in", display_value: 28 },
    ];
    expect(overallAttemptsFor(entries, "a1", "10m_Accel")).toEqual({
      units: "s",
      values: [1.7, 1.9],
    });
  });

  it("returns null when that athlete has no overall mark", () => {
    expect(overallAttemptsFor([base], "missing", "10m_Accel")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/attempts.test.ts`

Expected: FAIL with `overallAttemptsFor` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/dropoff/attempts.ts`:

```ts
export type DropoffEntry = {
  id: string;
  athlete_id: string;
  metric_key: string;
  interval_index: number | null;
  component: string | null;
  display_value: number | string;
  units: string;
  created_at: string;
};

export function overallAttemptsFor(
  entries: DropoffEntry[],
  athleteId: string,
  metricKey: string
): { units: string; values: number[] } | null {
  const rows = entries
    .filter(
      (entry) =>
        entry.athlete_id === athleteId &&
        entry.metric_key === metricKey &&
        entry.interval_index == null &&
        (entry.component == null || entry.component === "")
    )
    .slice()
    .sort((a, b) => {
      const byTime = a.created_at.localeCompare(b.created_at);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
  if (rows.length === 0) return null;
  return {
    units: rows[0].units,
    values: rows.map((row) => Number(row.display_value)),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dropoff/attempts.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/dropoff/attempts.ts src/lib/dropoff/attempts.test.ts
git commit -m "feat: select overall attempts for the drop-off line"
```

---

### Task 4: Attach the summary without touching the trend pill

**Files:**
- Create: `src/lib/dropoff/attach.ts`
- Test: `src/lib/dropoff/attach.test.ts`

**Step 1: Write the failing test**

Create `src/lib/dropoff/attach.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { attachDropoff, type DropoffAttempt } from "./attach";

type Row = {
  athlete_id: string;
  units: string;
  display_value: number;
  percent_change?: number;
  trend?: "up" | "neutral" | "down";
  session_initial?: number;
  dropoff_line?: number;
  attempts_above_line?: number;
  crossed_dropoff?: boolean;
};

describe("attachDropoff", () => {
  it("adds the line and leaves the last-session trend alone", () => {
    const rows: Row[] = [
      {
        athlete_id: "a1",
        units: "s",
        display_value: 1.7,
        percent_change: -2.4,
        trend: "up",
      },
    ];
    const attempts: DropoffAttempt[] = [
      { athleteId: "a1", id: "1", createdAt: "2026-10-28T15:01:00.000Z", displayValue: 1.7 },
      { athleteId: "a1", id: "2", createdAt: "2026-10-28T15:02:00.000Z", displayValue: 1.85 },
    ];
    const [row] = attachDropoff(rows, attempts, "time");
    expect(row.percent_change).toBe(-2.4);
    expect(row.trend).toBe("up");
    expect(row.display_value).toBe(1.7);
    expect(row.session_initial).toBe(1.7);
    expect(row.dropoff_line).toBe(1.8);
    expect(row.attempts_above_line).toBe(1);
    expect(row.crossed_dropoff).toBe(true);
  });

  it("leaves a row unchanged when that athlete has no attempts", () => {
    const rows: Row[] = [{ athlete_id: "a1", units: "in", display_value: 28 }];
    expect(attachDropoff(rows, [], "score")).toEqual(rows);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/attach.test.ts`

Expected: FAIL with `attachDropoff` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/dropoff/attach.ts`:

```ts
import { summarizeDropoff, type DropoffDirection } from "./summarize";

export type DropoffAttempt = {
  athleteId: string;
  id: string;
  createdAt: string;
  displayValue: number;
};

export type DropoffFields = {
  session_initial: number;
  dropoff_line: number;
  dropoff_percent: number;
  attempts_above_line: number;
  crossed_dropoff: boolean;
};

export function attachDropoff<T extends { athlete_id: string }>(
  rows: T[],
  attempts: DropoffAttempt[],
  direction: DropoffDirection
): Array<T & Partial<DropoffFields>> {
  const byAthlete = new Map<string, DropoffAttempt[]>();
  for (const attempt of attempts) {
    const list = byAthlete.get(attempt.athleteId);
    if (list) list.push(attempt);
    else byAthlete.set(attempt.athleteId, [attempt]);
  }

  return rows.map((row) => {
    const list = byAthlete.get(row.athlete_id);
    if (!list || list.length === 0) return row;
    const ordered = list.slice().sort((a, b) => {
      const byTime = a.createdAt.localeCompare(b.createdAt);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
    const summary = summarizeDropoff(
      ordered.map((attempt) => attempt.displayValue),
      direction
    );
    if (!summary) return row;
    return {
      ...row,
      session_initial: summary.initial,
      dropoff_line: summary.dropoffLine,
      dropoff_percent: summary.dropoffPercent,
      attempts_above_line: summary.attemptsAboveLine,
      crossed_dropoff: summary.crossedDropoff,
    };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dropoff/attach.test.ts`

Expected: PASS. Confirm `percent_change` and `trend` are unchanged in the first test.

**Step 5: Commit**

```bash
git add src/lib/dropoff/attach.ts src/lib/dropoff/attach.test.ts
git commit -m "feat: attach drop-off fields without changing session trend"
```

---

### Task 5: Caption text

**Files:**
- Create: `src/lib/dropoff/format.ts`
- Test: `src/lib/dropoff/format.test.ts`

Match the live card's number style in `formatValue` inside `src/app/leaderboard/LeaderboardClient.tsx`: whole numbers stay whole, everything else uses two decimals. `28.5` therefore renders as `28.50`. That is the board's existing rule.

**Step 1: Write the failing test**

Create `src/lib/dropoff/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDropoffCaption } from "./format";

describe("formatDropoffCaption", () => {
  it("prints the best and the line", () => {
    expect(
      formatDropoffCaption({
        initial: 10.42,
        dropoffLine: 11.05,
        dropoffPercent: 6,
        attemptsAboveLine: 3,
        crossedDropoff: false,
      })
    ).toBe("Best 10.42 · Line 11.05 · 3 above");
  });

  it("adds a past-the-line note when a later attempt crossed", () => {
    expect(
      formatDropoffCaption({
        initial: 28.5,
        dropoffLine: 26.79,
        dropoffPercent: 6,
        attemptsAboveLine: 2,
        crossedDropoff: true,
      })
    ).toBe("Best 28.50 · Line 26.79 · 2 above · Past the line");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/format.test.ts`

Expected: FAIL with `formatDropoffCaption` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/dropoff/format.ts`:

```ts
import type { DropoffSummary } from "./summarize";

function formatMark(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function formatDropoffCaption(summary: DropoffSummary): string {
  const base = `Best ${formatMark(summary.initial)} · Line ${formatMark(summary.dropoffLine)} · ${summary.attemptsAboveLine} above`;
  return summary.crossedDropoff ? `${base} · Past the line` : base;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dropoff/format.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/dropoff/format.ts src/lib/dropoff/format.test.ts
git commit -m "feat: format the drop-off caption"
```

---

### Task 6: Live leaderboard API

**Files:**
- Modify: `src/types/index.ts` (`LeaderboardRow`, after `population_id`)
- Modify: `src/app/api/leaderboard/route.ts` (after `leaderboardRows` is built, around the `guestFields` loop, and before `applyLeaderboardZones`)

Do not add these fields on `src/app/api/leaderboard/historical/route.ts`.

**Step 1: Write the failing test**

No new test file. The attach behavior is already covered. This task fails the typecheck until the route compiles with the new fields.

Add to `LeaderboardRow` in `src/types/index.ts`, after `population_id`:

```ts
  /** Today's best valid mark. Present only for drop-off metrics. */
  session_initial?: number;
  /** 6% quality line from session_initial. */
  dropoff_line?: number;
  dropoff_percent?: number;
  attempts_above_line?: number;
  crossed_dropoff?: boolean;
```

**Step 2: Run test to verify the route does not yet return the fields**

Run: `npx vitest run src/lib/dropoff/attach.test.ts`

Expected: PASS (helper exists). The route still does not call it. That is the gap this task closes. Do not add a mocked route test. `GET` in `src/app/api/leaderboard/route.ts` has many SQL branches and no route test today. A brittle mock would not be worth it.

**Step 3: Write minimal implementation**

In `src/app/api/leaderboard/route.ts`, add imports:

```ts
import { attachDropoff, type DropoffAttempt } from "@/lib/dropoff/attach";
import { isDropoffMetric } from "@/lib/dropoff/metrics";
import { directionFromUnits } from "@/lib/dropoff/summarize";
```

After the membership / `guestFields` loop and before `let zonedRows`, query attempts only for an allowlisted metric. Copy the same `overallOnly` / `interval_index` / `component` filter already used in the `best` CTE (the block that starts near `WHERE e.session_id`). Use `created_at`, then `id`.

```ts
    let rowsForZones = leaderboardRows;
    if (isDropoffMetric(metric) && leaderboardRows.length > 0) {
      const attemptResult = await sql`
        SELECT e.athlete_id, e.id, e.display_value, e.created_at
        FROM entries e
        WHERE e.session_id = ${session_id} AND e.metric_key = ${metric}
          AND (
            (
              ${overallOnly}::boolean = true
              AND e.interval_index IS NULL
              AND (
                e.component IS NULL
                OR (
                  ${metric}::text = '5-10-5_Agility'
                  AND e.component IN ('Average', 'Athlete-Comfort')
                )
              )
            )
            OR (
              ${overallOnly}::boolean = false
              AND (${interval_index}::int IS NULL OR e.interval_index = ${interval_index})
              AND (${component}::text IS NULL OR e.component = ${component})
            )
          )
        ORDER BY e.created_at ASC, e.id ASC
      `;
      const attempts: DropoffAttempt[] = (attemptResult.rows as {
        athlete_id: string;
        id: string;
        display_value: number | string;
        created_at: string | Date;
      }[]).map((row) => ({
        athleteId: row.athlete_id,
        id: row.id,
        displayValue: Number(row.display_value),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      }));
      rowsForZones = attachDropoff(
        leaderboardRows,
        attempts,
        directionFromUnits(effectiveUnits)
      );
    }
```

Pass `rowsForZones` into `applyLeaderboardZones` instead of `leaderboardRows`. `forPublicLeaderboard` spreads the row, so the new fields survive. Set `const zonedRows` from that applied result as the route already does. The gender split later filters `zonedRows`, so boys and girls keep the fields.

`directionFromUnits(effectiveUnits)` must match `sortAsc` (`effectiveUnits.toLowerCase() === "s"`). Do not pass a hardcoded direction.

**Step 4: Run tests**

Run: `npx vitest run src/lib/dropoff`

Expected: PASS.

Run: `npx tsc --noEmit --pretty false`

Expected: no new errors in `src/app/api/leaderboard/route.ts` or `src/types/index.ts`. If `tsc` reports existing errors in unrelated files, do not fix them in this task. Confirm the drop-off files are clean.

**Step 5: Commit**

```bash
git add src/types/index.ts src/app/api/leaderboard/route.ts
git commit -m "feat: return today's drop-off line on the live leaderboard"
```

---

### Task 7: Live card

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (`LeaderboardCard`, the block that ends with the trend pill, around lines 744–774)

The big mark stays `formatValue(primaryValue)`. The caption sits under it. The trend pill is untouched.

**Step 1: Write the failing test**

No component test. The caption is already tested in Task 5. This task is wiring.

**Step 2: Confirm the card does not yet read the new fields**

Search `LeaderboardClient.tsx` for `dropoff_line`. Expected: no matches before the edit.

**Step 3: Write minimal implementation**

Import `formatDropoffCaption` from `@/lib/dropoff/format` and `DropoffSummary` is not required if you build the object inline.

Inside `LeaderboardCard`, after `const primaryUnits = ...`:

```tsx
  const dropoffCaption =
    row.session_initial != null &&
    row.dropoff_line != null &&
    row.dropoff_percent != null &&
    row.attempts_above_line != null &&
    row.crossed_dropoff != null
      ? formatDropoffCaption({
          initial: row.session_initial,
          dropoffLine: row.dropoff_line,
          dropoffPercent: row.dropoff_percent,
          attemptsAboveLine: row.attempts_above_line,
          crossedDropoff: row.crossed_dropoff,
        })
      : null;
```

In the card JSX, after the value `<span className="mt-2 flex ...">` block and before the PB/SB row, add:

```tsx
      {dropoffCaption ? (
        <p
          className={`mt-1 font-mono text-xs tabular-nums ${
            row.crossed_dropoff ? "text-danger" : "text-foreground-muted"
          }`}
        >
          {dropoffCaption}
        </p>
      ) : null}
```

Use the existing `text-danger` class. Do not add a border that replaces `rankClass`. Do not change `pillClass` or `formatPillContent`.

**Step 4: Run tests and lint the file**

Run: `npx vitest run src/lib/dropoff`

Expected: PASS.

Run: `npx eslint src/app/leaderboard/LeaderboardClient.tsx`

Expected: no new errors from this edit.

**Step 5: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat: show the drop-off line on the live leaderboard card"
```

---

### Task 8: Data-entry readout

**Files:**
- Modify: `src/app/data-entry/EntryForm.tsx`

`EntryForm` is already a client component and already imports `useSWR`. On the session page, `EditSessionClient` fetches `/api/entries?session_id=${sessionId}`. Use that same SWR key so the cache is shared. After a successful save, `onSuccess` in `EditSessionClient` already calls `mutateEntries()`. Also mutate this key inside `EntryForm.submitEntry` after a successful POST so the readout updates on `/data-entry`, where the parent does not pass `onSuccess`.

Show the caption only when `isDropoffMetric(metricKey)` and `overallAttemptsFor` returns rows. Place it under the value hint (`!showNamedFlies` paragraph, around line 980) and above the error block.

**Step 1: Write the failing test**

No new test. `overallAttemptsFor` and `formatDropoffCaption` are already tested. This task wires them.

**Step 2: Confirm the form does not yet import drop-off helpers**

Search `EntryForm.tsx` for `isDropoffMetric`. Expected: no matches before the edit.

**Step 3: Write minimal implementation**

Add imports:

```ts
import { overallAttemptsFor, type DropoffEntry } from "@/lib/dropoff/attempts";
import { formatDropoffCaption } from "@/lib/dropoff/format";
import { isDropoffMetric } from "@/lib/dropoff/metrics";
import { directionFromUnits, summarizeDropoff } from "@/lib/dropoff/summarize";
```

Inside the component, after `effectiveSessionId` is defined:

```ts
  const entriesKey = effectiveSessionId
    ? `/api/entries?session_id=${effectiveSessionId}`
    : null;
  const { data: sessionEntriesRes } = useSWR<{ data?: DropoffEntry[] }>(
    entriesKey,
    (url: string) => fetch(url).then((r) => r.json())
  );
```

`EntryForm` already has a `fetcher` pattern or inline fetch. If a module-level `fetcher` does not exist in this file, use the inline function above. Do not create a second fetcher style if the file already has one. Check the imports at the top before adding.

Derive the caption during render:

```ts
  const dropoffCaption = (() => {
    if (!isDropoffMetric(metricKey) || !athleteId) return null;
    const picked = overallAttemptsFor(
      sessionEntriesRes?.data ?? [],
      athleteId,
      metricKey
    );
    if (!picked) return null;
    const summary = summarizeDropoff(picked.values, directionFromUnits(picked.units));
    return summary ? formatDropoffCaption(summary) : null;
  })();
```

Render under the value hint:

```tsx
      {dropoffCaption ? (
        <p className="mt-2 font-mono text-xs tabular-nums text-foreground-muted" role="status">
          {dropoffCaption}
        </p>
      ) : null}
```

In `submitEntry`, after the response is OK and before `setSuccess`, add:

```ts
      if (entriesKey) {
        void mutate(entriesKey);
      }
```

`mutate` comes from `useSWRConfig`, which this file already imports. If `mutate` is not destructured yet, add `const { mutate } = useSWRConfig();` next to the other hooks.

Do not parse the in-progress raw input. The line is from saved attempts only.

**Step 4: Run tests and lint**

Run: `npx vitest run src/lib/dropoff`

Expected: PASS.

Run: `npx eslint src/app/data-entry/EntryForm.tsx`

Expected: no new errors from this edit.

**Step 5: Commit**

```bash
git add src/app/data-entry/EntryForm.tsx
git commit -m "feat: show the drop-off line while entering a mark"
```

---

### Task 9: Session entries table

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx` (the entries `<table>` around line 502)

Each table row is one attempt. Repeat the full caption only once per athlete + metric, on the overall row (`component` null and `interval_index` null) that is the best. Other overall rows for that group that are past the final line get the text `Past the line` in `text-danger`. Component rows (splits) get nothing.

**Step 1: Write the failing test**

Add to `src/lib/dropoff/format.test.ts`:

```ts
import { attemptPastLine } from "./format";

describe("attemptPastLine", () => {
  it("is false for a time still at or under the line", () => {
    expect(attemptPastLine(1.8, 1.8, "time")).toBe(false);
    expect(attemptPastLine(1.81, 1.8, "time")).toBe(true);
  });

  it("is false for a jump still at or above the line", () => {
    expect(attemptPastLine(26.79, 26.79, "score")).toBe(false);
    expect(attemptPastLine(26.7, 26.79, "score")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/format.test.ts`

Expected: FAIL with `attemptPastLine` not defined.

**Step 3: Write minimal implementation**

Add to `src/lib/dropoff/format.ts`:

```ts
import type { DropoffDirection } from "./summarize";

export function attemptPastLine(
  value: number,
  line: number,
  direction: DropoffDirection
): boolean {
  return direction === "time" ? value > line : value < line;
}
```

Keep the existing `DropoffSummary` import. Add `DropoffDirection` to that import instead of a second import from the same module.

In `EditSessionClient.tsx`, import `overallAttemptsFor`, `isDropoffMetric`, `directionFromUnits`, `summarizeDropoff`, `formatDropoffCaption`, and `attemptPastLine`.

`EntryRow` in this file already has `created_at`, `display_value`, `component`, and `interval_index`. It is compatible with `DropoffEntry`.

Above the `entriesRes.data.map`, do not build a new array of rows on each cell. Build a map once in the render before the table:

```tsx
        {entriesRes?.data && entriesRes.data.length > 0 ? (
          <EntriesTable rows={entriesRes.data} metricsRegistry={metricsRegistry} ... />
        ) : (
```

Do not extract a new component unless the map callback becomes hard to read. Inline is fine:

```tsx
        {entriesRes.data.map((row) => {
          const picked =
            isDropoffMetric(row.metric_key) &&
            row.interval_index == null &&
            (row.component == null || row.component === "")
              ? overallAttemptsFor(entriesRes.data ?? [], row.athlete_id, row.metric_key)
              : null;
          const summary = picked
            ? summarizeDropoff(picked.values, directionFromUnits(picked.units))
            : null;
          const isBest =
            summary != null && Number(row.display_value) === summary.initial;
          const past =
            summary != null &&
            attemptPastLine(
              Number(row.display_value),
              summary.dropoffLine,
              directionFromUnits(row.units)
            );
          return (
            <tr key={row.id} className="border-b border-border/50 text-foreground">
              {/* existing athlete and metric cells */}
              <td className="px-3 py-2 font-mono">
                {row.display_value}
                {summary && isBest ? (
                  <div className="text-xs text-foreground-muted">{formatDropoffCaption(summary)}</div>
                ) : null}
                {summary && past && !isBest ? (
                  <div className="text-xs text-danger">Past the line</div>
                ) : null}
              </td>
              {/* existing units and actions cells */}
            </tr>
          );
        })}
```

Calling `overallAttemptsFor` per row is acceptable. A session's entry list is small. Do not change delete or edit behavior.

If two attempts tie at the best, both get the caption. That is correct.

**Step 4: Run tests and lint**

Run: `npx vitest run src/lib/dropoff`

Expected: PASS, including the two new `attemptPastLine` tests.

Run: `npx eslint src/app/data-entry/session/[id]/EditSessionClient.tsx src/lib/dropoff/format.ts`

Expected: no new errors from this edit.

**Step 5: Commit**

```bash
git add src/lib/dropoff/format.ts src/lib/dropoff/format.test.ts src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat: mark attempts past the drop-off line in the session log"
```

---

### Task 10: Verify

**Step 1: Run the drop-off tests and the leaderboard unit tests**

Run: `npx vitest run src/lib/dropoff src/app/leaderboard/leaderboardDiff.test.ts src/lib/leaderboard-sections.test.ts`

Expected: PASS. The leaderboard tests prove the row type change did not break sectioning or animation diffs. Those tests construct `LeaderboardRow` objects. New fields are optional, so they should still compile.

**Step 2: Lint the touched UI files**

Run: `npx eslint src/app/leaderboard/LeaderboardClient.tsx src/app/data-entry/EntryForm.tsx src/app/data-entry/session/[id]/EditSessionClient.tsx src/app/api/leaderboard/route.ts src/lib/dropoff`

Expected: no errors.

**Step 3: Manual check with the dev server**

Run: `npm run dev`

There is no component test runner, so this is the UI check:

1. Open a session whose metric is `10m_Accel` or `Vertical Jump`. Log two attempts for one athlete. The second time attempt should be more than 6% slower than the best, or the second jump more than 6% shorter.
2. On the entry form, after the first save, the readout shows `Best … · Line … · 1 above`. After the second save it includes `Past the line`.
3. On the live leaderboard for that metric, the card shows the same caption in danger color. The rank still uses the best mark. The up/down pill, if present, still reflects the previous session, not 6%.
4. Open the leaderboard for `40yd_Dash` or `3x200m`. The card has no drop-off caption.
5. On the session entries table, the best overall row shows the caption and a later attempt past the line says `Past the line`.

If the database is not running, say so and stop. Do not invent marks.

**Step 6: Do not commit unless the manual check passed**

No extra commit if the code is already committed in Tasks 1–9. If the manual check forced a fix, commit that fix separately:

```bash
git add <files you changed>
git commit -m "fix: correct drop-off display after manual check"
```
