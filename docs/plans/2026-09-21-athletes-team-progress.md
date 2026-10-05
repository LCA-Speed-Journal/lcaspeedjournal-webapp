# Athletes Dashboards + Team Progress Charts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/athletes` a school-year Team Leaders view (men/women + per Hugo team) with compact athlete-detail progression, and change Team Progress ISO Rocks / testing-trend charts to logged volume and per-athlete % change from baseline.

**Architecture:** Keep aggregation in pure helpers under `src/lib/` (TDD first). The team-overview API loads rows then calls `buildTeamLeaders`. ISO Rocks and testing trends stay in `src/lib/team-progress/` and only change how series are shaped; the existing Recharts dual-line chart plots the new keys. Athlete-detail progression is one bundle GET so the client does not need N `useSWR` hooks.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, SWR, Recharts, NextAuth coach session, Vercel Postgres (`sql` from `src/lib/db.ts`), Vitest.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`). Run `npm test` and `npm run dev` from the repo root. Paths are relative to that root.

**Do not:** change `schoolYearRange()` (Aug 1–Jul 31) used by Team Progress presets; remove athlete-detail PRs / F2F / archetypes / superpowers; overlay prescribed ISO template duration on the chart; include alumni or staff on Team Leaders.

**Locked product decisions**

| Topic | Choice |
|-------|--------|
| Landing leaders | Every metric with data in the window (not core-only) |
| Columns | Men / Women (gender `M` / `F`) |
| Hugo sections | Accordion per group that has ≥1 mark; multi-sport athletes can appear on more than one |
| Leftover overview | Recent coach notes only |
| Eligibility | `active = true` AND `athlete_type = 'athlete'` |
| Default dates | Aug 1 → June 6 inclusive (`speedJournalSchoolYearRange`). Jun 7–Jul 31 uses the year that just ended |
| ISO Rocks | Logged holds only. Solid = median of per-athlete **total** seconds that day. Dashed = median of per-athlete **mean set** seconds |
| Testing Y-axis | Median of each athlete’s `% change` vs **their first mark in the selected range**. Signed: `(value - baseline) / \|baseline\| * 100` (faster times go negative) |
| Testing tooltip | min/mean/median/max of raw output **and** of % change |
| Scoreboard | Unchanged: still first/last raw team median + `improved_pct` |
| Athlete progression | `displayedTestKeys(hugo_primary)` + squat / press / hinge from `set_results` |

**Reference:** Design in chat + [`src/app/api/team-overview/route.ts`](../../src/app/api/team-overview/route.ts), [`src/lib/team-progress/test-aggregate.ts`](../../src/lib/team-progress/test-aggregate.ts), [`src/lib/team-progress/iso-rocks.ts`](../../src/lib/team-progress/iso-rocks.ts), [`src/lib/team-progress/headlines.ts`](../../src/lib/team-progress/headlines.ts). Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

---

## Domain notes (read before coding)

### School-year window

`schoolYearRange()` in [`src/lib/team-progress/date-presets.ts`](../../src/lib/team-progress/date-presets.ts) is **Aug 1 – Jul 31**. Do not change it. Add a **new** helper `speedJournalSchoolYearRange()`:

- If UTC month ≥ 8: `{ from: Y-08-01, to: (Y+1)-06-06 }`
- Else: `{ from: (Y-1)-08-01, to: Y-06-06 }`

That covers “after June 6 and before August 1 → year that just ended.”

### Team Leaders best-mark rule

Same as today’s overview / PRs:

- Ignore non-primary components (`isPrimaryResultComponent`).
- Units `s` → lower is better (min). Else higher is better (max).
- Collapse all mph keys into one `MaxVelocity` leader via `getVelocityMetricKeys()` / `getMaxVelocityKey()`.

Overall = best among eligible athletes. Hugo section = best among eligible athletes **who have that `hugo_group` membership**. An athlete on soccer and football can lead both.

### ISO volume

Each logged set is one `set_results` row (`loadTeamProgressIsoLogRows`). `usableHoldSeconds` already accepts `kind === "duration"` or `kind === "output"` with units `s`.

Per athlete / rock / day:

- `total` = sum of hold seconds
- `perSet` = mean of those holds
- `sets` = count

Team point: `median(totals)`, `median(perSets)`, `n` = athletes.

Two 45s sets must plot **90** on the solid line and **45** on the dashed line. Same Y-axis (seconds).

Drop prescribed template series from the **chart and PDF**. `aggregateIsoRocks` can remain for now but `combineIsoRockSeries` / payload should expose `total_points` + `per_set_points`. Do not plot plan-vs-logged.

### Testing % change

Keep `points[].median` as the **raw team median of that day’s marks** so scoreboard `first` / `last` / `delta` stay in seconds/inches/mph.

Add on each point:

- `median_change_pct` — median of per-athlete % changes (0 on an athlete’s first in-range date)
- `output` — `{ min, mean, median, max }` of that day’s raw marks
- `change` — same shape for % changes

Chart Y = `median_change_pct`. Draw a 0% reference line.

### Athlete progression bundle

Do **not** call `/api/progression` once per metric from the client (hooks can’t be a dynamic list). One GET returns every series.

---

### Task 1: School-year helper (Aug 1–June 6)

**Files:**
- Modify: `src/lib/team-progress/date-presets.ts`
- Test: `src/lib/team-progress/date-presets.test.ts`

**Step 1: Write the failing test**

Create `src/lib/team-progress/date-presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { schoolYearRange, speedJournalSchoolYearRange } from "./date-presets";

describe("speedJournalSchoolYearRange", () => {
  it("uses Aug 1 this year through June 6 next year after August 1", () => {
    expect(speedJournalSchoolYearRange(new Date("2026-09-21T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
  });

  it("uses the year that just ended between June 7 and July 31", () => {
    expect(speedJournalSchoolYearRange(new Date("2027-06-10T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
    expect(speedJournalSchoolYearRange(new Date("2027-07-15T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
  });

  it("uses previous Aug 1 through this June 6 in January", () => {
    expect(speedJournalSchoolYearRange(new Date("2027-01-15T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-06-06",
    });
  });

  it("does not change the Team Progress Jul 31 school-year preset", () => {
    expect(schoolYearRange(new Date("2026-09-21T12:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2027-07-31",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team-progress/date-presets.test.ts`

Expected: FAIL — `speedJournalSchoolYearRange` is not exported.

**Step 3: Write minimal implementation**

Add to `src/lib/team-progress/date-presets.ts` (do not edit `schoolYearRange`):

```ts
/** Speed Journal school year containing `today` (Aug 1 – June 6). UTC calendar parts. */
export function speedJournalSchoolYearRange(today: Date = new Date()): DateRange {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  if (m >= 8) {
    return { from: isoLocal(y, 8, 1), to: isoLocal(y + 1, 6, 6) };
  }
  return { from: isoLocal(y - 1, 8, 1), to: isoLocal(y, 6, 6) };
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/team-progress/date-presets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/team-progress/date-presets.ts src/lib/team-progress/date-presets.test.ts
git commit -m "feat: add Aug 1–June 6 school-year range for athlete dashboards"
```

---

### Task 2: summarize + percentChange helpers

**Files:**
- Modify: `src/lib/team-progress/stats.ts`
- Test: `src/lib/team-progress/stats.test.ts`

**Step 1: Write the failing tests**

Append to `src/lib/team-progress/stats.test.ts`:

```ts
import { percentChange, summarize } from "./stats";

describe("summarize", () => {
  it("returns min/mean/median/max", () => {
    expect(summarize([4, 1, 3, 2])).toEqual({
      min: 1,
      mean: 2.5,
      median: 2.5,
      max: 4,
    });
  });

  it("returns null for an empty list", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("percentChange", () => {
  it("is signed vs baseline", () => {
    expect(percentChange(5.0, 5.2)).toBeCloseTo(((5.0 - 5.2) / 5.2) * 100);
    expect(percentChange(22, 20)).toBeCloseTo(10);
  });

  it("returns null when baseline is 0", () => {
    expect(percentChange(1, 0)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team-progress/stats.test.ts`

Expected: FAIL — exports missing.

**Step 3: Write minimal implementation**

Add to `src/lib/team-progress/stats.ts`:

```ts
export type StatBox = {
  min: number;
  mean: number;
  median: number;
  max: number;
};

export function summarize(values: number[]): StatBox | null {
  if (values.length === 0) return null;
  const med = median(values);
  if (med == null) return null;
  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, mean: sum / values.length, median: med, max };
}

export function percentChange(value: number, baseline: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) {
    return null;
  }
  return ((value - baseline) / Math.abs(baseline)) * 100;
}
```

Extend `SeriesPoint` (optional fields so lifts keep compiling):

```ts
export type SeriesPoint = {
  date: string;
  median: number;
  n: number;
  median_change_pct?: number | null;
  output?: StatBox;
  change?: StatBox;
};
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/team-progress/stats.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/team-progress/stats.ts src/lib/team-progress/stats.test.ts
git commit -m "feat: add summarize and percent-change helpers for team-progress charts"
```

---

### Task 3: Team Leaders aggregator (pure)

**Files:**
- Create: `src/lib/athletes/team-leaders.ts`
- Test: `src/lib/athletes/team-leaders.test.ts`

Extract the “best mark per metric per gender / Hugo group” logic so the API route stays thin. Do **not** import Next.js or `sql` here.

**Step 1: Write the failing test**

Create `src/lib/athletes/team-leaders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTeamLeaders, type LeaderEntryRow, type LeaderAthlete } from "./team-leaders";

const athletes: LeaderAthlete[] = [
  { id: "m1", first_name: "Max", last_name: "Male", gender: "M", hugo_groups: ["football"] },
  { id: "f1", first_name: "Faye", last_name: "Female", gender: "F", hugo_groups: ["volleyball"] },
  { id: "m2", first_name: "Alum", last_name: "Gone", gender: "M", hugo_groups: ["football"] },
];

const entries: LeaderEntryRow[] = [
  { athlete_id: "m1", metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.1, units: "s" },
  { athlete_id: "m1", metric_key: "40yd_Dash", component: "0-10yd", display_value: 1.5, units: "s" },
  { athlete_id: "f1", metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.8, units: "s" },
  { athlete_id: "m2", metric_key: "40yd_Dash", component: "0-40yd", display_value: 4.4, units: "s" },
];

describe("buildTeamLeaders", () => {
  it("splits overall leaders by gender and ignores split components", () => {
    const { overall } = buildTeamLeaders({
      athletes: athletes.filter((a) => a.id !== "m2"),
      entries,
    });
    const forty = overall.find((r) => r.metric_key === "40yd_Dash")!;
    expect(forty.lower_is_better).toBe(true);
    expect(forty.men?.athlete_id).toBe("m1");
    expect(forty.men?.best_value).toBe(5.1);
    expect(forty.women?.athlete_id).toBe("f1");
    expect(forty.women?.best_value).toBe(5.8);
  });

  it("scopes Hugo sections to membership and can list the same athlete on two teams", () => {
    const dual: LeaderAthlete[] = [
      { id: "m1", first_name: "Max", last_name: "Male", gender: "M", hugo_groups: ["football", "soccer"] },
    ];
    const { hugo } = buildTeamLeaders({
      athletes: dual,
      entries: [
        { athlete_id: "m1", metric_key: "Standing-Broad", component: null, display_value: 9.5, units: "ft" },
      ],
    });
    const groups = hugo.map((h) => h.hugo_group).sort();
    expect(groups).toEqual(["football", "soccer"]);
    expect(hugo[0]!.leaders[0]!.men?.athlete_id).toBe("m1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/athletes/team-leaders.test.ts`

Expected: FAIL — module missing.

**Step 3: Write minimal implementation**

Create `src/lib/athletes/team-leaders.ts`. Use `getMetricsRegistry`, `isPrimaryResultComponent`, `getVelocityMetricKeys`, `getMaxVelocityKey`, `hasVelocityMetrics` the same way [`src/app/api/team-overview/route.ts`](../../src/app/api/team-overview/route.ts) does today.

Types:

```ts
export type LeaderEntryRow = {
  athlete_id: string;
  metric_key: string;
  component: string | null;
  display_value: number;
  units: string;
};

export type LeaderAthlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  hugo_groups: string[];
};

export type LeaderCell = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  best_value: number;
};

export type LeaderMetricRow = {
  metric_key: string;
  display_name: string;
  units: string;
  lower_is_better: boolean;
  men: LeaderCell | null;
  women: LeaderCell | null;
};

export type HugoLeaderBlock = {
  hugo_group: string;
  leaders: LeaderMetricRow[];
};
```

Algorithm:

1. Build per-athlete-metric min/max from primary components only.
2. Pick best overall per `(metric, gender)` where gender is `M` or `F` (treat `male`/`female` case-insensitively like `/api/progression`).
3. Repeat per Hugo group using athletes whose `hugo_groups` include that key. Skip groups with no cells.
4. Sort metric rows by `display_name`. Sort Hugo blocks in `HUGO_GROUPS` order.
5. Add a synthetic `MaxVelocity` row when mph keys exist and the registry uses that collapse.

**Step 4: Run tests**

Run: `npx vitest run src/lib/athletes/team-leaders.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/athletes/team-leaders.ts src/lib/athletes/team-leaders.test.ts
git commit -m "feat: compute gendered and per-Hugo team leaders from entries"
```

---

### Task 4: ISO Rocks logged total vs per-set

**Files:**
- Modify: `src/lib/team-progress/iso-rocks.ts`
- Test: `src/lib/team-progress/iso-rocks.test.ts`

**Step 1: Write the failing test**

Replace the `aggregateIsoRockActuals` example in `iso-rocks.test.ts` (or add a new describe) so two Copenhagen sets for one athlete sum:

```ts
describe("aggregateIsoRockActuals volume", () => {
  it("sums logged holds per athlete and medians total vs per-set", () => {
    const series = aggregateIsoRockActuals([
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 45,
        units: "s",
      },
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 45,
        units: "s",
      },
      {
        athlete_id: "a2",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 50,
        units: "s",
      },
    ]);
    const c = series.find((s) => s.rock_id === "copenhagen")!;
    // a1 total 90 per-set 45; a2 total 50 per-set 50 → median total 70, median per-set 47.5
    expect(c.total_points).toEqual([{ date: "2026-09-18", seconds: 70, n: 2 }]);
    expect(c.per_set_points).toEqual([{ date: "2026-09-18", seconds: 47.5, n: 2 }]);
  });
});
```

Update the old “best hold / median 45” test: it used one set each (40 and 50) → totals 40 and 50, median total **45**, per-set same **45**. Keep that assertion on `total_points` / `per_set_points`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team-progress/iso-rocks.test.ts`

Expected: FAIL — still best-hold + `actual_points` only.

**Step 3: Write minimal implementation**

Change `IsoRockSeries`:

```ts
export type IsoRockSeries = {
  rock_id: IsoRockId;
  label: string;
  total_points: IsoRockPoint[];
  per_set_points: IsoRockPoint[];
  /** @deprecated kept empty; prefer total_points */
  points: IsoRockPoint[];
  prescribed_points: IsoRockPoint[];
  actual_points: IsoRockPoint[];
};
```

Rewrite `aggregateIsoRockActuals`:

- Group usable holds by `rockId\0date\0athleteId` as an **array** of seconds (do not max).
- Per athlete: `total = sum`, `perSet = total / sets`.
- Per `rockId\0date`: median of totals → `total_points`; median of perSets → `per_set_points`.
- Set `actual_points = total_points` so any leftover caller still sees volume, not best-hold.

Rewrite `combineIsoRockSeries` to copy `total_points` / `per_set_points` from actuals. Leave `prescribed_points` empty (or omit from the filter). Filter series where `total_points.length > 0 || per_set_points.length > 0`.

YAGNI: stop calling `aggregateIsoRocks` from `buildTeamProgressPayload` in Task 7. In this task only change iso-rocks.ts + tests.

**Step 4: Run tests**

Run: `npx vitest run src/lib/team-progress/iso-rocks.test.ts`

Expected: PASS (also keep existing `extractSecondsNearAlias` / prescribed tests green).

**Step 5: Commit**

```bash
git add src/lib/team-progress/iso-rocks.ts src/lib/team-progress/iso-rocks.test.ts
git commit -m "feat: plot ISO Rocks from logged total volume and per-set duration"
```

---

### Task 5: Testing series as % change from first-in-range

**Files:**
- Modify: `src/lib/team-progress/test-aggregate.ts`
- Test: `src/lib/team-progress/test-aggregate.test.ts`

The existing 40yd fixture:

- 8/10: a1=5.2, a2=5.0, a3=5.4 → raw median 5.2
- 10/01: a1=5.0, a2=4.9, a3=5.1 → raw median 5.0
- %: a1=(5.0-5.2)/5.2*100 ≈ -3.846; a2=-2.0; a3=(5.1-5.4)/5.4*100 ≈ -5.556; median ≈ -3.846

**Step 1: Update the failing assertion**

In `test-aggregate.test.ts`, change the 40yd `points` expect to include the new fields. Keep `first.median === 5.2`, `last.median === 5.0`, `delta ≈ -0.2`, `improved_pct === 1`.

```ts
expect(forty.points[0]!.median).toBe(5.2);
expect(forty.points[0]!.median_change_pct).toBe(0);
expect(forty.points[0]!.n).toBe(3);
expect(forty.points[1]!.median).toBe(5.0);
expect(forty.points[1]!.median_change_pct).toBeCloseTo(((5.0 - 5.2) / 5.2) * 100);
expect(forty.points[1]!.output).toEqual({
  min: 4.9,
  mean: expect.closeTo((5.0 + 4.9 + 5.1) / 3),
  median: 5.0,
  max: 5.1,
});
```

Vitest: `expect.closeTo` is a matcher, not valid inside `toEqual`. Assert `output.min/max/median` exactly and `output.mean` with `toBeCloseTo`. Same for `change`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team-progress/test-aggregate.test.ts`

Expected: FAIL — `median_change_pct` undefined.

**Step 3: Write minimal implementation**

In `aggregateTestSeries`, after `best` (athlete+date → value):

1. Per athlete, baseline = value on that athlete’s earliest date in `best`.
2. For each date, collect raw values and % changes (`percentChange`; skip nulls). First date for an athlete contributes `0`.
3. `median` = `median(rawValues)` (scoreboard).
4. `median_change_pct` = `median(changeValues)`.
5. `output` / `change` = `summarize(...)`.

Do not change `athleteTestDeltas` or `improved_pct`.

**Step 4: Run tests**

Run: `npx vitest run src/lib/team-progress/test-aggregate.test.ts src/app/api/reporting/team-progress/route.test.ts`

Expected: PASS. If the API test snapshots points, update them to the new shape.

**Step 5: Commit**

```bash
git add src/lib/team-progress/test-aggregate.ts src/lib/team-progress/test-aggregate.test.ts
git commit -m "feat: chart testing trends as median percent change from first-in-range"
```

---

### Task 6: Team Progress chart tooltip + 0% line

**Files:**
- Modify: `src/app/reporting/team-progress/TeamProgressChart.tsx`

**Step 1: No isolated UI test** — this repo does not render Recharts in Vitest. Implement directly; verify in Task 7/16.

**Step 2: Extend point + tooltip**

In `TeamProgressChart.tsx`:

- Extend `Point` with optional `output?: StatBox` and `change?: StatBox`.
- Pass those through `buildChartRows` onto the row.
- Add optional `ySuffix` (default `units`) and `showZeroLine?: boolean`.
- Custom `Tooltip` content when `output` or `change` is present:

```
{date} · {W#D#}
{primaryLabel}: {value}{units}
n = {n}
Output: min / mean / median / max
Change %: min / mean / median / max
```

- When `showZeroLine`, add Recharts `ReferenceLine y={0}`.
- Y-axis tick formatter: if units is `%`, show one decimal.

Keep the existing dual `Line` for ISO (total vs per-set).

**Step 3: Commit**

```bash
git add src/app/reporting/team-progress/TeamProgressChart.tsx
git commit -m "feat: show output and change stats in team-progress chart tooltips"
```

---

### Task 7: Wire Team Progress page + PDF

**Files:**
- Modify: `src/lib/team-progress/build-payload.ts`
- Modify: `src/app/reporting/team-progress/TeamProgressClient.tsx`
- Modify: `src/lib/team-progress/pdf.tsx`
- Test: `src/lib/team-progress/pdf.test.ts` (update ISO heading if it asserts copy)

**Step 1: Payload**

In `buildTeamProgressPayload`:

- Stop feeding prescribed templates into the chart series. Either skip `loadTeamProgressIsoTemplates` + `aggregateIsoRocks`, or still load template dates only for `timeline_dates` if tests depend on them. Prefer: keep template load for timeline completeness, but `combineIsoRockSeries` should ignore prescribed for the plotted series.
- Map ISO to `total_points` / `per_set_points`.

**Step 2: Client charts**

Testing trends:

```tsx
<TeamProgressLineChart
  label="Median change from baseline"
  units="%"
  showZeroLine
  timelineAnchor={payload.timeline_anchor}
  timelineDates={payload.timeline_dates}
  points={t.points.map((p) => ({
    date: p.date,
    value: p.median_change_pct ?? 0,
    n: p.n,
    output: p.output,
    change: p.change,
  }))}
/>
```

Caption under the heading: `Median change from each athlete’s first mark in this window. Tooltip shows raw output and % change (min / mean / median / max).`

ISO:

```tsx
<TeamProgressLineChart
  label="Total volume"
  secondaryLabel="Per set"
  units="s"
  points={(rock.total_points ?? []).map((p) => ({
    date: p.date,
    value: p.seconds,
    n: p.n,
  }))}
  secondaryPoints={(rock.per_set_points ?? []).map((p) => ({
    date: p.date,
    value: p.seconds,
    n: p.n,
  }))}
  timelineAnchor={payload.timeline_anchor}
  timelineDates={payload.timeline_dates}
/>
```

Caption: `Logged holds — solid is team median of each athlete’s total seconds that day; dashed is median per-set duration. Extra sets lift the solid line only.`

**Step 3: PDF**

Change heading from `ISO Rocks (plan vs logged / day)` to `ISO Rocks (logged total / per-set)`. Each date line: `total {N}s / set {N}s`. Drop plan Δ.

If PDF prints testing medians as raw numbers, leave the scoreboard table on raw `first`/`last`/`delta`. Do not need to print the % series.

**Step 4: Run tests**

Run: `npx vitest run src/lib/team-progress/pdf.test.ts src/app/api/reporting/team-progress/route.test.ts src/lib/team-progress/iso-rocks.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/team-progress/build-payload.ts src/app/reporting/team-progress/TeamProgressClient.tsx src/lib/team-progress/pdf.tsx src/lib/team-progress/pdf.test.ts src/app/api/reporting/team-progress/route.test.ts
git commit -m "feat: show logged ISO volume and percent-change testing charts"
```

---

### Task 8: Team overview API

**Files:**
- Modify: `src/app/api/team-overview/route.ts`

**Step 1: Query + helper**

`GET /api/team-overview?from=&to=`

- Parse dates with `parseReportingDateRange` from `src/lib/reporting-date-range.ts`. If both missing, default to `speedJournalSchoolYearRange()`. If only one is present, 400.
- Eligible athletes:

```sql
SELECT id, first_name, last_name, gender
FROM athletes
WHERE active = true AND athlete_type = 'athlete'
```

If `athlete_type` column is missing, keep the existing try/catch fallback but still prefer `active = true`.

- Memberships: `SELECT athlete_id, hugo_group FROM athlete_hugo_memberships WHERE athlete_id = ANY($ids)`.
- Entries in range (join sessions):

```sql
SELECT e.athlete_id, e.metric_key, e.component, e.display_value, e.units
FROM entries e
INNER JOIN sessions s ON s.id = e.session_id
WHERE e.athlete_id = ANY($ids)
  AND s.session_date >= $from::date
  AND s.session_date <= $to::date
```

- `buildTeamLeaders({ athletes: withGroups, entries })`.
- Recent notes: same as today (active eligible IDs, limit 10). Drop event-group / archetype / superpower / kryptonite queries.

Response:

```ts
{
  data: {
    from,
    to,
    active_count: number,
    overall_leaders: LeaderMetricRow[],
    hugo_leaders: HugoLeaderBlock[],
    recent_notes: ...existing shape...
  }
}
```

**Step 2: Run lint/typecheck**

Run: `npx tsc --noEmit --pretty false` if the project supports it, else `npm run lint`.

Expected: no errors from the new payload vs the old dashboard (Task 9 updates the client in the next commit — temporarily the dashboard will break at type-level if it imports the old shape; update both in this task if `tsc` is run on the app. **Prefer updating the dashboard in Task 9 immediately after this** so the tree compiles. If you keep them in one commit, that is OK — still write tests in Task 3 first.)

**Step 3: Commit** (API only if dashboard still compiles; otherwise combine with Task 9)

```bash
git add src/app/api/team-overview/route.ts
git commit -m "feat: return dated gendered team leaders from team-overview API"
```

---

### Task 9: Team overview dashboard UI

**Files:**
- Modify: `src/app/athletes/TeamOverviewDashboard.tsx`
- Modify: `src/app/athletes/AthletesClient.tsx`

**Step 1: Replace landing UI**

`TeamOverviewDashboard`:

- On mount, `from`/`to` = `speedJournalSchoolYearRange()`. Same SSR-then-hydrate pattern as `TeamProgressClient` (`ready` flag) to avoid hydration mismatch.
- SWR key: `` `/api/team-overview?from=${from}&to=${to}` ``
- Controls: School year button + two date inputs. Changing dates refetches.
- Header: `Team Leaders` + `{active_count} current athletes · {from} → {to}`
- Overall table:

```
Metric | Men | Women
40yd Dash | Max Male — 5.10 s | Faye Female — 5.80 s
```

Empty cell: `—`. Clicking a name is optional YAGNI (no navigation required).

- Hugo: `<details>` accordion, closed by default, one per `hugo_leaders` block. Title = `HUGO_GROUP_META[group].label`. Same two-column table inside. Skip unknown group keys.
- Recent coach notes: existing list markup.
- Remove event-group / archetype / superpower sections.

`AthletesClient.tsx`: change `max-w-4xl` to `max-w-6xl` on the main card so the two-column table fits.

**Step 2: Commit**

```bash
git add src/app/athletes/TeamOverviewDashboard.tsx src/app/athletes/AthletesClient.tsx src/app/api/team-overview/route.ts
git commit -m "feat: show school-year men/women team leaders on /athletes"
```

---

### Task 10: Compact Teams & events on athlete detail

**Files:**
- Create: `src/app/athletes/TeamsAndEventsSection.tsx`
- Modify: `src/app/athletes/AthleteDashboard.tsx`
- Keep: `HugoTeamsSection.tsx` / `EventsSection.tsx` until the new section works, then switch the dashboard import. Do not delete the old files in this task unless unused (user rule: do not delete files without confirmation). Leave old files in place and unused.

**Step 1: Merge UI**

`TeamsAndEventsSection` is one `rounded-xl` card (not the oversized `border-2` Hugo header card):

- Title: `Teams & events`
- Hugo: reuse the checkbox + Primary radio logic from `HugoTeamsSection` (same `/api/weight-room/rosters` POST/DELETE/PATCH). Render as a dense `grid-cols-2 lg:grid-cols-3` with `min-h-[36px]` rows, smaller padding.
- Event groups: reuse chip assign/remove from `EventsSection` (same `/api/athletes/:id/event-groups`).
- Keep “Metrics with data” chips from `EventsSection` under the groups.

`AthleteDashboard`: render `<TeamsAndEventsSection athleteId={athleteId} />` instead of the two separate sections.

**Step 2: Commit**

```bash
git add src/app/athletes/TeamsAndEventsSection.tsx src/app/athletes/AthleteDashboard.tsx
git commit -m "feat: merge Hugo teams and event groups into one compact athlete card"
```

---

### Task 11: Per-athlete lift series helper

**Files:**
- Create: `src/lib/athletes/lift-series.ts`
- Test: `src/lib/athletes/lift-series.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { athleteLiftSeries } from "./lift-series";

describe("athleteLiftSeries", () => {
  it("takes each day's best load_reps per squat/press/hinge", () => {
    const series = athleteLiftSeries([
      { session_date: "2026-08-11", movement_name: "Goblet Squat", kind: "load_reps", load: 50 },
      { session_date: "2026-08-11", movement_name: "Goblet Squat", kind: "load_reps", load: 55 },
      { session_date: "2026-08-18", movement_name: "Front Squat", kind: "load_reps", load: 65 },
      { session_date: "2026-08-11", movement_name: "Trap Bar Deadlift", kind: "load_reps", load: 200 },
    ]);
    const squat = series.find((s) => s.lift_id === "squat")!;
    expect(squat.points).toEqual([
      { date: "2026-08-11", value: 55 },
      { date: "2026-08-18", value: 65 },
    ]);
    expect(series.find((s) => s.lift_id === "hinge")).toBeUndefined();
  });
});
```

**Step 2: Run to verify fail**

Run: `npx vitest run src/lib/athletes/lift-series.test.ts`

Expected: FAIL — module missing.

**Step 3: Implement**

Use `classifyLiftName` / `LIFT_PATTERNS` from `src/lib/team-progress/headlines.ts`. Skip trap-bar (already null). `label` = `LIFT_PATTERNS` label (Squat / Press / Hinge), not the raw movement name.

```ts
export type AthleteLiftPoint = { date: string; value: number };
export type AthleteLiftSeries = {
  lift_id: "squat" | "press" | "hinge";
  label: string;
  units: "lb";
  points: AthleteLiftPoint[];
};
```

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/athletes/lift-series.ts src/lib/athletes/lift-series.test.ts
git commit -m "feat: derive per-athlete squat press hinge series from set logs"
```

---

### Task 12: Dashboard progression bundle API

**Files:**
- Create: `src/app/api/athletes/[id]/dashboard-progression/route.ts`

**Step 1: Implement GET**

`GET /api/athletes/:id/dashboard-progression?from=&to=`

Auth: same as other athlete GETs (public read is OK — `/api/progression` is public). Validate `from`/`to` with `parseReportingDateRange`.

1. Load athlete; 404 if missing. Attach Hugo via `attachHugoGroupsFromDb`. `primary = hugo_primary ?? hugo_groups[0] ?? "extracurricular"`.
2. `metricKeys = displayedTestKeys(primary)` from `src/lib/team-progress/headlines.ts`. Apply the same 40→20 fallback as `buildTeamProgressPayload` if this athlete has 20yd primary data and no 40.
3. Load that athlete’s `entries` joined to `sessions` in range (copy the shape of `loadTeamProgressTestEntries` but for one id). For each metric, best per date (reuse `isPrimaryResultComponent` / MaxVelocity collapse). Map to `ProgressionPoint[]`: `{ session_date, display_value, units }`. Skip metrics with 0 points.
4. Load lift rows:

```sql
SELECT l.session_date, m.name AS movement_name, r.kind, r.load
FROM session_logs l
INNER JOIN set_results r ON r.session_log_id = l.id
INNER JOIN workout_movements m ON m.id = r.movement_id
WHERE l.athlete_id = $id
  AND l.session_date >= $from::date
  AND l.session_date <= $to::date
```

Then `athleteLiftSeries(...)`.

Response:

```ts
{
  data: {
    from,
    to,
    hugo_primary: string | null,
    tests: { metric_key: string; display_name: string; units: string; points: ProgressionPoint[] }[],
    lifts: { lift_id: string; label: string; units: "lb"; points: { session_date: string; display_value: number }[] }[],
  }
}
```

Normalize lift points to `session_date` / `display_value` so `ProgressionChart` can render them with `points={lifts.points}`.

**Step 2: Commit**

```bash
git add src/app/api/athletes/[id]/dashboard-progression/route.ts
git commit -m "feat: add athlete dashboard progression bundle for tests and lifts"
```

---

### Task 13: Progression & Flags uses the bundle

**Files:**
- Modify: `src/app/athletes/ProgressionFlagsSection.tsx`

**Step 1: Replace the two hardcoded metric hooks**

- Default `from`/`to` = `speedJournalSchoolYearRange()` (not last 90 days).
- One SWR: `` `/api/athletes/${athleteId}/dashboard-progression?from=${from}&to=${to}` ``
- Render a 2-column grid of every `tests[]` series then every `lifts[]` series. Each cell: title, `ProgressionChart` (`ssr: false` dynamic import, already in file), “Full chart” link for **tests** to `/historical?...`. Lifts have no historical page — omit the link.
- Caption: `School year {from} → {to}` (or “Primary metrics for {sport} plus squat / press / hinge”).
- Keep the flags list/form exactly as it is.

Empty: if both arrays empty, show `No test or lift marks in this window.`

**Step 2: Commit**

```bash
git add src/app/athletes/ProgressionFlagsSection.tsx
git commit -m "feat: show team primary metrics and lifts on athlete progression"
```

---

### Task 14: Full test suite + lint

**Step 1: Run**

```bash
npm test
npm run lint
```

Expected: all green. Fix anything this work broke (`route.test.ts` ISO fixtures, PDF tests, SeriesPoint extras).

**Step 2: Commit only if you had to fix files**

```bash
git add -u
git commit -m "test: update team-progress fixtures for volume and percent-change series"
```

---

### Task 15: Browser verification

Use @verification-before-completion. Dev server: `npm run dev`.

**Athletes landing (`/athletes`, no `id`)**

- Default range is this school year (today is 2026-09-21 → `2026-08-01`–`2027-06-06`).
- Overall table has **both** a men and a women cell on metrics that have both genders.
- Alumni/staff names do not appear.
- Hugo accordions exist only for teams with data; opening one shows a gendered table.
- Event-group / archetype / superpower blocks are gone; recent notes remain.
- Changing from/to refetches.

**Athlete detail (`/athletes?id=`)**

- Teams & events is one compact card; toggling a Hugo sport and assigning an event group still persist.
- Progression shows that athlete’s primary-sport tests (not just two metrics) plus squat/press/hinge when logged.
- Flags add/resolve still works.
- PRs / F2F / archetypes / superpowers still render.

**Team Progress (`/reporting/team-progress`)**

- Testing chart Y values are percents; first testing day sits on 0%; tooltip lists output and change stats.
- ISO: a day with two logged sets is higher on the solid line than per-set dashed.
- Scoreboard raw deltas still look like seconds/inches, not percents.
- PDF download still works; ISO lines say total/per-set.

Fix any bug before calling the work done.

---

## Execution notes

- One task at a time. Do not skip the failing-test step on Tasks 1–5 and 11.
- After each commit, `git status` should be clean except files for the next task.
- If a later task needs a type change in `IsoRockSeries` / `SeriesPoint`, update callers in that same commit.

---

## Out of scope

- Changing Team Progress `schoolYearRange` (Jul 31).
- Leader click-through to the athlete dashboard.
- Top-N (only one leader per metric per gender).
- Prescribed ISO overlay.
- Deleting unused `HugoTeamsSection.tsx` / `EventsSection.tsx`.
