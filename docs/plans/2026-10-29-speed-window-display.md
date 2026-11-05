# Speed Window Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give each acceleration and each non-spanning build-in its own leader line, point Max Velocity at the fastest build-in, and draw team speed as a dot curve plus a season percent-change chart.

**Architecture:** Pure helpers in `src/lib/speed/` decide which windows are spanning, which build-in is the fastest, where scatter dots sit, and what the `5-15yd` baseline mph is. Team leaders, historical, progression, and team progress call those helpers or the same SQL shape (`metric_key = 'BuildIn'`). No schema change and no change to `expandSpeedRun`.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates), SWR, existing Recharts chart in `src/app/reporting/team-progress/TeamProgressClient.tsx`.

**Product source:** `docs/plans/2026-10-29-speed-window-display-design.md`.

---

## Rules the implementer must not break

- From-zero accelerations are always leader lines. `0-40yd` stays even though `0-10yd` sits inside it. The user asked for `0-5`, `0-10`, `0-20`, and `0-40` as separate lines.
- A build-in is spanning when another window in the **same session** and **same distance unit** sits strictly inside it (`other.start >= this.start`, `other.end <= this.end`, and the spans are not equal). `10-40` is spanning when `10-20` or `20-40` is in that session. Spanning build-ins stay eligible for Max Velocity and stay off leader lines, the scatter plot, and Speed trends.
- Yards and meters never share a line or an axis. Component text is `${start}-${end}${unit}` (`src/lib/speed/windows.ts` `windowLabel`).
- Max Velocity is the highest `BuildIn.display_value`. Do not read `getVelocityMetricKeys()` for it. Resisted sleds stay out. The winning row's component is the window name (`22.40 mph · 20-30yd`).
- `5-15yd` season baseline uses `reconstructFiveFifteen` on the **seconds** in `value` for `5-10yd` and `10-20yd` from the athlete's earliest session in the reporting window that has both. The chart number is the returned `mph`. Later points are the best timed `5-15yd` `display_value`. If reconstruction fails, the baseline is the first timed `5-15yd`.
- Do not change sprint save, migration, drop-off, resisted sleds, hurdles, jumps, or agility.
- There is no React component test runner. UI tasks call tested helpers.
- Run tests with `npx vitest run <file>`.

---

### Task 1: Spanning build-ins

**Files:**
- Create: `src/lib/speed/adjacent.ts`
- Test: `src/lib/speed/adjacent.test.ts`

**Step 1: Write the failing test**

Create `src/lib/speed/adjacent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { spanningBuildInKeys, type SpeedWindowRow } from "./adjacent";

const session = "s1";

function row(partial: Partial<SpeedWindowRow> & Pick<SpeedWindowRow, "metric_key" | "component">): SpeedWindowRow {
  return {
    session_id: session,
    distance_unit: partial.component.endsWith("m") ? "m" : "yd",
    start_distance: 0,
    end_distance: 0,
    ...partial,
  };
}

describe("spanningBuildInKeys", () => {
  it("hides 10-40 when 10-20 is in the same session and keeps every acceleration", () => {
    const rows: SpeedWindowRow[] = [
      row({ metric_key: "Acceleration", component: "0-10yd", start_distance: 0, end_distance: 10 }),
      row({ metric_key: "Acceleration", component: "0-40yd", start_distance: 0, end_distance: 40 }),
      row({ metric_key: "BuildIn", component: "10-20yd", start_distance: 10, end_distance: 20 }),
      row({ metric_key: "BuildIn", component: "20-40yd", start_distance: 20, end_distance: 40 }),
      row({ metric_key: "BuildIn", component: "10-40yd", start_distance: 10, end_distance: 40 }),
    ];
    expect(spanningBuildInKeys(rows)).toEqual(new Set(["s1|yd|10|40"]));
  });

  it("keeps a 10-40 that is the only window in its session", () => {
    const rows: SpeedWindowRow[] = [
      row({
        session_id: "solo",
        metric_key: "BuildIn",
        component: "10-40yd",
        start_distance: 10,
        end_distance: 40,
      }),
    ];
    expect(spanningBuildInKeys(rows).size).toBe(0);
  });

  it("does not let a meter window hide a yard window", () => {
    const rows: SpeedWindowRow[] = [
      row({ metric_key: "BuildIn", component: "10-20m", distance_unit: "m", start_distance: 10, end_distance: 20 }),
      row({ metric_key: "BuildIn", component: "10-40yd", start_distance: 10, end_distance: 40 }),
    ];
    expect(spanningBuildInKeys(rows).size).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/adjacent.test.ts`

Expected: FAIL with "Cannot find module './adjacent'"

**Step 3: Write minimal implementation**

Create `src/lib/speed/adjacent.ts`:

```ts
import { ACCELERATION_KEY, BUILD_IN_KEY, type DistanceUnit } from "./windows";

export type SpeedWindowRow = {
  session_id: string;
  metric_key: string;
  component: string;
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
};

export function windowIdentity(row: SpeedWindowRow): string {
  return `${row.session_id}|${row.distance_unit}|${row.start_distance}|${row.end_distance}`;
}

export function spanningBuildInKeys(rows: SpeedWindowRow[]): Set<string> {
  const bySessionUnit = new Map<string, SpeedWindowRow[]>();
  for (const row of rows) {
    if (row.metric_key !== ACCELERATION_KEY && row.metric_key !== BUILD_IN_KEY) continue;
    const key = `${row.session_id}|${row.distance_unit}`;
    const list = bySessionUnit.get(key);
    if (list) list.push(row);
    else bySessionUnit.set(key, [row]);
  }
  const spanning = new Set<string>();
  for (const group of bySessionUnit.values()) {
    for (const row of group) {
      if (row.metric_key !== BUILD_IN_KEY) continue;
      const contains = group.some(
        (other) =>
          other !== row &&
          other.start_distance >= row.start_distance &&
          other.end_distance <= row.end_distance &&
          (other.start_distance !== row.start_distance ||
            other.end_distance !== row.end_distance)
      );
      if (contains) spanning.add(windowIdentity(row));
    }
  }
  return spanning;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/adjacent.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/speed/adjacent.ts src/lib/speed/adjacent.test.ts
git commit -m "feat: detect build-ins that contain another window"
```

---

### Task 2: One leader line per window

**Files:**
- Modify: `src/lib/athletes/team-leaders.ts`
- Modify: `src/app/api/team-overview/route.ts` (select `e.session_id::text`, `e.start_distance`, `e.end_distance`, `e.distance_unit`)
- Modify: `src/app/athletes/TeamOverviewDashboard.tsx` (`formatCell` appends `window_label`)
- Test: `src/lib/athletes/team-leaders.test.ts`

`LeaderEntryRow` gains optional `session_id`, `start_distance`, `end_distance`, and `distance_unit`. `LeaderCell` gains optional `window_label: string | null`.

**Step 1: Write the failing test**

Add this test to `src/lib/athletes/team-leaders.test.ts`:

```ts
it("lists each acceleration and each non-spanning build-in, and names the max-velocity window", () => {
  const { overall } = buildTeamLeaders({
    athletes: athletes.filter((a) => a.id !== "m2"),
    entries: [
      {
        athlete_id: "m1",
        session_id: "s1",
        metric_key: "Acceleration",
        component: "0-10yd",
        distance_unit: "yd",
        start_distance: 0,
        end_distance: 10,
        display_value: 1.7,
        units: "s",
      },
      {
        athlete_id: "m1",
        session_id: "s1",
        metric_key: "Acceleration",
        component: "0-40yd",
        distance_unit: "yd",
        start_distance: 0,
        end_distance: 40,
        display_value: 4.8,
        units: "s",
      },
      {
        athlete_id: "m1",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-20yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 20,
        display_value: 18,
        units: "mph",
      },
      {
        athlete_id: "f1",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-20yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 20,
        display_value: 19.5,
        units: "mph",
      },
      {
        athlete_id: "m1",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-40yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 40,
        display_value: 22,
        units: "mph",
      },
      {
        athlete_id: "m1",
        session_id: "s2",
        metric_key: "BuildIn",
        component: "20-40yd",
        distance_unit: "yd",
        start_distance: 20,
        end_distance: 40,
        display_value: 21,
        units: "mph",
      },
    ],
  });
  const names = overall.map((row) => row.display_name);
  expect(names).toContain("0-10yd");
  expect(names).toContain("0-40yd");
  expect(names).toContain("10-20yd");
  expect(names).toContain("20-40yd");
  expect(names).not.toContain("10-40yd");
  const ten = overall.find((row) => row.display_name === "0-10yd")!;
  expect(ten.units).toBe("s");
  expect(ten.lower_is_better).toBe(true);
  expect(ten.men?.best_value).toBe(1.7);
  const fly = overall.find((row) => row.display_name === "10-20yd")!;
  expect(fly.units).toBe("mph");
  expect(fly.women?.athlete_id).toBe("f1");
  expect(fly.women?.best_value).toBe(19.5);
  const maxV = overall.find((row) => row.metric_key === "MaxVelocity")!;
  expect(maxV.men?.best_value).toBe(22);
  expect(maxV.men?.window_label).toBe("10-40yd");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/athletes/team-leaders.test.ts`

Expected: FAIL because `0-10yd` is not a display name and `window_label` is missing.

**Step 3: Write minimal implementation**

In `buildMetricRows`, after the existing per-athlete component aggregation:

- Build `SpeedWindowRow`s from entries that have `session_id`, numeric start and end, and `distance_unit` of `m` or `yd`. Call `spanningBuildInKeys`.
- For `metric_key === "Acceleration"`, `applyMark` under key `${metric_key}\t${component}` with `display_name` = component, units `s`, `lower_is_better` true, value = min `display_value`. Do this even when the window is inside a longer acceleration.
- For `metric_key === "BuildIn"`, skip the row when `spanningBuildInKeys` contains `windowIdentity`. Otherwise `applyMark` under `${metric_key}\t${component}` with units `mph`, `lower_is_better` false, value = max `display_value`.
- These window rows are their own `LeaderMetricRow`s. They are not nested in `splits`. Sort accelerations before build-ins, then by start, then by end. Parse start and end from the component with `/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(m|yd)$/`.
- Max Velocity: among **all** `BuildIn` rows, including spanning ones, keep the max `display_value` per gender. Set `LeaderCell.window_label` to that row's `component`. Ignore `getVelocityMetricKeys()` and the old `flyMph` path for this pick. Leave the existing `40yd_Dash` split nesting alone so the current 40-yard tests still pass.
- Update the existing test `"adds Max Velocity from mph metrics and 20-40yd fly splits"` so a `10-20m_Split` row no longer creates Max Velocity. Max Velocity in that test comes only from a `BuildIn` row. Keep the assertion that the `20-40yd` split on `40yd_Dash` is still nested and stored in seconds.

In `src/app/api/team-overview/route.ts`, add `e.session_id::text AS session_id`, `e.start_distance`, `e.end_distance`, `e.distance_unit` to the entries query and pass them through. If the query throws on a missing column (`42703`), retry without those columns and leave them undefined. Undefined distance means the row is not used for the new window lines; old metric keys still flow through.

In `formatCell` in `TeamOverviewDashboard.tsx`:

```ts
function formatCell(cell: LeaderCell | null, units: string): string {
  if (!cell) return "—";
  const value = formatValue(cell.best_value, units);
  const named = `${cell.first_name} ${cell.last_name} — ${value}`;
  return cell.window_label ? `${named} · ${cell.window_label}` : named;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/athletes/team-leaders.test.ts`

Expected: PASS, including the updated Max Velocity test.

**Step 5: Commit**

```bash
git add src/lib/athletes/team-leaders.ts src/lib/athletes/team-leaders.test.ts src/app/api/team-overview/route.ts src/app/athletes/TeamOverviewDashboard.tsx
git commit -m "feat: list each speed window on team leaders"
```

---

### Task 3: Pick the fastest build-in

**Files:**
- Create: `src/lib/speed/max-velocity.ts`
- Test: `src/lib/speed/max-velocity.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { bestBuildIn } from "./max-velocity";

describe("bestBuildIn", () => {
  it("picks the highest mph and keeps that window, ignoring a sled", () => {
    const best = bestBuildIn([
      { metric_key: "BuildIn", component: "10-20yd", display_value: 19 },
      { metric_key: "BuildIn", component: "20-40yd", display_value: 22.4 },
      { metric_key: "10-20m_Light-Sled", component: null, display_value: 30 },
      { metric_key: "Acceleration", component: "0-10yd", display_value: 1.6 },
    ]);
    expect(best).toEqual({ display_value: 22.4, component: "20-40yd" });
  });

  it("returns null when there is no build-in", () => {
    expect(bestBuildIn([])).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/max-velocity.test.ts`

Expected: FAIL with "Cannot find module './max-velocity'"

**Step 3: Write minimal implementation**

```ts
import { BUILD_IN_KEY } from "./windows";

export type BuildInMark = {
  metric_key: string;
  component: string | null;
  display_value: number;
};

export function bestBuildIn(rows: BuildInMark[]): { display_value: number; component: string } | null {
  let best: { display_value: number; component: string } | null = null;
  for (const row of rows) {
    if (row.metric_key !== BUILD_IN_KEY) continue;
    if (!Number.isFinite(row.display_value)) continue;
    if (best == null || row.display_value > best.display_value) {
      best = { display_value: row.display_value, component: row.component ?? "" };
    }
  }
  return best;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/max-velocity.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/speed/max-velocity.ts src/lib/speed/max-velocity.test.ts
git commit -m "feat: pick the fastest build-in as max velocity"
```

---

### Task 4: Historical and progression read build-ins

**Files:**
- Modify: `src/app/api/leaderboard/historical/route.ts` (the `isMaxVelocity` branch around the `velocityKeys` query)
- Modify: `src/app/api/progression/route.ts` (both `isMaxVelocity` queries, the athlete query and the team-average query)
- Modify: `src/lib/team-progress/test-aggregate.ts` `matchesMetric` when `metricKey === getMaxVelocityKey()`
- Test: `src/lib/team-progress/test-aggregate.test.ts`
- Test: `src/app/api/leaderboard/historical/route.test.ts`

**Step 1: Write the failing test**

Add to `src/lib/team-progress/test-aggregate.test.ts`:

```ts
it("uses the best BuildIn mph for Max Velocity and ignores a sled", () => {
  const series = aggregateTestSeries({
    hugoGroup: "football",
    metricKeys: ["MaxVelocity"],
    rows: [
      {
        athlete_id: "a1",
        session_date: "2026-09-01",
        metric_key: "BuildIn",
        component: "10-20yd",
        display_value: 18,
        units: "mph",
      },
      {
        athlete_id: "a1",
        session_date: "2026-09-01",
        metric_key: "BuildIn",
        component: "20-40yd",
        display_value: 21,
        units: "mph",
      },
      {
        athlete_id: "a1",
        session_date: "2026-09-01",
        metric_key: "10-20m_Light-Sled",
        component: null,
        display_value: 30,
        units: "mph",
      },
    ],
  });
  expect(series[0]!.points[0]!.median).toBe(21);
  expect(series[0]!.units).toBe("mph");
});
```

Match the existing `TestEntryRow` field names in that file if a field above is named differently. Read the fixture helper at the top of the test file and use it.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team-progress/test-aggregate.test.ts`

Expected: FAIL because the median is missing or is not 21.

**Step 3: Write minimal implementation**

In `matchesMetric`, replace the Max Velocity branch:

```ts
if (metricKey === getMaxVelocityKey()) {
  return row.metric_key === "BuildIn";
}
```

Remove the `velocityKeys` argument from that branch. Leave the parameter on the function so other call sites compile. Do not treat registry mph keys as Max Velocity.

In `src/app/api/leaderboard/historical/route.ts`, replace the `velocityKeys` `IN` clause with `e.metric_key = 'BuildIn'`. Select `e.component` in the filtered CTE and carry it out as `source_component`. `DISTINCT ON (athlete_id) ... ORDER BY athlete_id, display_value DESC` already keeps the fastest row; include `component` in that row. Put `source_component` on the leaderboard row next to `source_metric_key`.

In `src/app/api/progression/route.ts`, replace both Max Velocity queries. Stop using `MAX()` across mph keys. Use one row per athlete per session date:

```sql
SELECT DISTINCT ON (s.session_date, e.athlete_id)
  s.session_date::text,
  e.athlete_id::text,
  a.first_name, a.last_name, a.gender,
  'mph' AS units,
  e.display_value,
  e.component
FROM entries e
INNER JOIN sessions s ON s.id = e.session_id
INNER JOIN athletes a ON a.id = e.athlete_id
WHERE s.session_date >= $from::date
  AND s.session_date <= $to::date
  AND e.metric_key = 'BuildIn'
  AND (e.athlete_id = $id OR ...)
ORDER BY s.session_date, e.athlete_id, e.display_value DESC
```

Add `component` onto the progression point type as `window_label`. The team-average query is the same without the athlete filter. Average the chosen `display_value`s; do not average every fly from the same run.

Add a historical route test that mocks `sql` (see `textOf` in `route.test.ts`). When the query text includes `metric_key = ` and the bound value is `BuildIn`, return one row with `display_value: 22.4` and `source_component: "20-40yd"`. Assert the JSON row's `source_component` is `20-40yd`. A query that still mentions `10-20m_Split` fails the test.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/team-progress/test-aggregate.test.ts src/app/api/leaderboard/historical/route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/team-progress/test-aggregate.ts src/lib/team-progress/test-aggregate.test.ts src/app/api/leaderboard/historical/route.ts src/app/api/leaderboard/historical/route.test.ts src/app/api/progression/route.ts
git commit -m "feat: read max velocity from build-in rows"
```

---

### Task 5: Historical window menu

**Files:**
- Create: `src/lib/speed/window-metric.ts`
- Create: `src/app/api/speed/windows/route.ts`
- Modify: `src/app/api/leaderboard/historical/route.ts`
- Modify: `src/app/api/progression/route.ts`
- Modify: `src/app/historical/HistoricalClient.tsx`
- Test: `src/lib/speed/window-metric.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { formatWindowMetric, parseWindowMetric } from "./window-metric";

describe("parseWindowMetric", () => {
  it("round-trips an acceleration and a build-in", () => {
    expect(parseWindowMetric(formatWindowMetric("Acceleration", "0-10yd"))).toEqual({
      metric_key: "Acceleration",
      component: "0-10yd",
    });
    expect(parseWindowMetric(formatWindowMetric("BuildIn", "10-20yd"))).toEqual({
      metric_key: "BuildIn",
      component: "10-20yd",
    });
  });

  it("returns null for Max Velocity and for junk", () => {
    expect(parseWindowMetric("MaxVelocity")).toBeNull();
    expect(parseWindowMetric("window:Jump:0-10yd")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/window-metric.test.ts`

Expected: FAIL with "Cannot find module './window-metric'"

**Step 3: Write minimal implementation**

`formatWindowMetric` returns `window:${metricKey}:${component}`. `parseWindowMetric` accepts only `Acceleration` and `BuildIn` and a component matching `/^\d+(?:\.\d+)?-\d+(?:\.\d+)?(?:m|yd)$/`. Anything else returns null.

`GET /api/speed/windows?from=&to=` returns `{ accelerations: string[], build_ins: string[] }`. Query `session_id`, `metric_key`, `component`, `distance_unit`, `start_distance`, `end_distance` for `Acceleration` and `BuildIn` in the date range. Drop rows whose identity is in `spanningBuildInKeys`. Return the sorted unique components. Accelerations sort before nothing else in their own array. On undefined column `42703`, return both arrays empty.

Historical and progression: when `parseWindowMetric(metric)` is non-null, query that `metric_key` and `component` only. Acceleration ranks and aggregates with `MIN` (lower is better, units `s`). Build-in uses `MAX` (units `mph`). Do not run the Max Velocity branch for these metrics.

`HistoricalClient` fetches `/api/speed/windows` with the same `from` and `to` as the page. Append those options after the registry metrics. Label them with the component (`0-10yd`, `10-20yd`). Value is `formatWindowMetric`. Keep `MaxVelocity` in the list from `/api/metrics`. When the selected metric is Max Velocity, show `source_component` from the historical row and `window_label` on the progression point beside the mph.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/window-metric.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/speed/window-metric.ts src/lib/speed/window-metric.test.ts src/app/api/speed/windows/route.ts src/app/api/leaderboard/historical/route.ts src/app/api/progression/route.ts src/app/historical/HistoricalClient.tsx
git commit -m "feat: filter historical charts to one speed window"
```

---

### Task 6: Scatter dots and the curve

**Files:**
- Modify: `src/lib/speed/profile.ts`
- Test: `src/lib/speed/profile.test.ts`
- Create: `src/components/speed/SpeedCurve.tsx`
- Modify: `src/app/api/speed/profile/route.ts`
- Modify: `src/app/athletes/TeamOverviewDashboard.tsx`
- Modify: `src/app/athletes/AthleteDashboard.tsx`

**Step 1: Write the failing test**

Add to `src/lib/speed/profile.test.ts`:

```ts
import { medianCurve, speedDots } from "./profile";

describe("speedDots", () => {
  it("keeps each athlete's best non-spanning fly at the middle of the window", () => {
    const dots = speedDots([
      {
        athlete_id: "a1",
        athlete_name: "Ann",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-20yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 20,
        display_value: 18,
      },
      {
        athlete_id: "a1",
        athlete_name: "Ann",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-20yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 20,
        display_value: 20,
      },
      {
        athlete_id: "a1",
        athlete_name: "Ann",
        session_id: "s1",
        metric_key: "BuildIn",
        component: "10-40yd",
        distance_unit: "yd",
        start_distance: 10,
        end_distance: 40,
        display_value: 22,
      },
    ]);
    expect(dots).toEqual([
      { athlete_id: "a1", athlete_name: "Ann", component: "10-20yd", x: 15, mph: 20, distance_unit: "yd" },
    ]);
  });
});

describe("medianCurve", () => {
  it("starts at 0 and uses the median mph at each midpoint", () => {
    const curve = medianCurve([
      { athlete_id: "a", athlete_name: "A", component: "5-10yd", x: 7.5, mph: 16, distance_unit: "yd" },
      { athlete_id: "b", athlete_name: "B", component: "5-10yd", x: 7.5, mph: 18, distance_unit: "yd" },
      { athlete_id: "a", athlete_name: "A", component: "10-20yd", x: 15, mph: 20, distance_unit: "yd" },
    ]);
    expect(curve).toEqual([
      { x: 0, mph: 0 },
      { x: 7.5, mph: 17 },
      { x: 15, mph: 20 },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/profile.test.ts`

Expected: FAIL with `speedDots` is not exported.

**Step 3: Write minimal implementation**

Extend the profile row type with `athlete_id`, `athlete_name`, `session_id`, `metric_key`, and `component`. `speedDots` drops spanning identities from `spanningBuildInKeys`, keeps the max mph per `athlete_id + component + distance_unit`, and sets `x` to `(start + end) / 2`. `medianCurve(dots)` groups one unit (the caller filters the unit first), sorts midpoints, and prepends `{ x: 0, mph: 0 }`. Reuse the median already in this file.

`SpeedCurve.tsx` is a client component. Props: `dots` and `unit`. It draws an SVG. Each dot is a `<circle>`. The curve is a `<polyline>` through `medianCurve`. The brightest dot is the max mph. A `<title>` on each circle reads `${name}, ${component}, ${mph} mph`. Yards and meters are two charts when both units have dots. Empty dots render a short "No build-ins in this window." line.

`/api/speed/profile` selects `session_id`, `metric_key`, `component`, `start_distance`, `end_distance`, `distance_unit`, `display_value`, `athlete_id`, and the athlete's first and last name. Group queries join `athletes` the same way they already join memberships. Keep the `42703` empty-list fallback.

Replace `BuildInVelocityChart` in `TeamOverviewDashboard.tsx` and `AthleteDashboard.tsx` with `SpeedCurve`. Pass `aggregate` behavior by feeding all athletes' dots on the team page and one athlete's dots on the athlete page. The athlete page's fastest dot label is the component of the dot with the highest mph, rendered as text under the chart: `Fastest ${mph} mph · ${component}`.

Leave `segmentsForFlyLength` and its tests in place. Stop importing `VelocitySegments` from the two dashboards. Delete `src/components/speed/VelocitySegments.tsx` only after nothing imports it.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/profile.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/speed/profile.ts src/lib/speed/profile.test.ts src/components/speed/SpeedCurve.tsx src/app/api/speed/profile/route.ts src/app/athletes/TeamOverviewDashboard.tsx src/app/athletes/AthleteDashboard.tsx src/components/speed/VelocitySegments.tsx
git commit -m "feat: plot each athlete's speed as a curve from the start"
```

---

### Task 7: 5-15 baseline and speed trends

**Files:**
- Create: `src/lib/team-progress/speed-trends.ts`
- Test: `src/lib/team-progress/speed-trends.test.ts`
- Modify: `src/lib/team-progress/load.ts` (select `e.session_id`, `e.value` for speed rows)
- Modify: `src/lib/team-progress/build-payload.ts`
- Modify: `src/app/reporting/team-progress/TeamProgressClient.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { aggregateSpeedTrends, type SpeedTrendRow } from "./speed-trends";

function mark(partial: Partial<SpeedTrendRow> & Pick<SpeedTrendRow, "component" | "session_date" | "display_value">): SpeedTrendRow {
  return {
    athlete_id: "a1",
    session_id: partial.session_date,
    metric_key: "BuildIn",
    distance_unit: "yd",
    start_distance: 0,
    end_distance: 0,
    value: partial.display_value,
    units: "mph",
    ...partial,
  };
}

describe("aggregateSpeedTrends", () => {
  it("baselines 5-15 from the reconstructed 5-10 and 10-20, then uses a later timed fly", () => {
    const trends = aggregateSpeedTrends([
      mark({
        session_date: "2026-08-01",
        component: "5-10yd",
        start_distance: 5,
        end_distance: 10,
        value: 0.7,
        display_value: 0.7,
        units: "s",
        metric_key: "BuildIn",
      }),
      mark({
        session_date: "2026-08-01",
        component: "10-20yd",
        start_distance: 10,
        end_distance: 20,
        value: 1.3,
        display_value: 1.3,
        units: "s",
        metric_key: "BuildIn",
      }),
      mark({
        session_date: "2026-09-01",
        component: "5-15yd",
        start_distance: 5,
        end_distance: 15,
        value: 1.1,
        display_value: 18.6,
      }),
    ]);
    const five = trends.find((trend) => trend.component === "5-15yd")!;
    expect(five.points[0]!.date).toBe("2026-08-01");
    expect(five.points[0]!.median_change_pct).toBe(0);
    expect(five.points[1]!.median_change_pct).not.toBe(0);
    expect(five.points[1]!.output?.median).toBe(18.6);
  });

  it("drops a spanning 10-40 and keeps 10-20", () => {
    const trends = aggregateSpeedTrends([
      mark({ component: "10-20yd", session_date: "2026-09-01", start_distance: 10, end_distance: 20, display_value: 19, session_id: "s1" }),
      mark({ component: "10-40yd", session_date: "2026-09-01", start_distance: 10, end_distance: 40, display_value: 17, session_id: "s1" }),
      mark({ component: "10-20yd", session_date: "2026-09-08", start_distance: 10, end_distance: 20, display_value: 20, session_id: "s2" }),
    ]);
    expect(trends.map((trend) => trend.component)).toEqual(["10-20yd"]);
  });
});
```

Use real `reconstructFiveFifteen(0.7, 1.3)` in the assertion if you need the exact baseline mph. The first point's raw median is that mph. The second point's percent change is `percentChange(18.6, baselineMph)` from `src/lib/team-progress/stats.ts`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team-progress/speed-trends.test.ts`

Expected: FAIL with "Cannot find module './speed-trends'"

**Step 3: Write minimal implementation**

`aggregateSpeedTrends` returns one series per non-spanning build-in component that has at least two dates, or a `5-15yd` series when a baseline plus one later mark exist. Each point matches `SeriesPoint`: `date`, `median` (median raw mph that day), `n`, `median_change_pct`, `output`, `change`. Change is from each athlete's baseline, using `percentChange`. Higher mph is positive.

For every component except `5-15yd`, the baseline is that athlete's best mph on their earliest date for that component.

For `5-15yd`, look at the athlete's earliest session that has both a `5-10yd` and a `10-20yd` `value` in seconds. Call `reconstructFiveFifteen`. Put that mph on that session's date with `median_change_pct` 0. Later dates use the best `5-15yd` `display_value`. If reconstruction returns null, use the first timed `5-15yd` instead and do not invent a baseline date.

`loadTeamProgressTestEntries` does not have to change for the jump cards. Add `loadSpeedWindowRows` that selects `session_id`, `value`, `display_value`, `component`, `start_distance`, `end_distance`, `distance_unit`, `metric_key`, `athlete_id`, and `session_date` for `Acceleration` and `BuildIn`. On `42703`, return `[]`.

`buildTeamProgressPayload` adds `speed_trends: ReturnType<typeof aggregateSpeedTrends>`.

In `TeamProgressClient.tsx`, under the Testing trends section, add Speed trends. Copy the `TeamProgressLineChart` usage at the testing-trends map. Title each card with the component. Units are `%` for the line and the tooltip already shows `output` and `change`. Pass `points` the same way testing trends does (`value: p.median_change_pct ?? 0`). Omit the section when `speed_trends` is empty.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/team-progress/speed-trends.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/team-progress/speed-trends.ts src/lib/team-progress/speed-trends.test.ts src/lib/team-progress/load.ts src/lib/team-progress/build-payload.ts src/app/reporting/team-progress/TeamProgressClient.tsx
git commit -m "feat: chart season change for each build-in"
```

---

### Task 8: Regression pass

**Step 1: Run the speed and leader tests together**

Run:

```bash
npx vitest run src/lib/speed src/lib/athletes/team-leaders.test.ts src/lib/team-progress/test-aggregate.test.ts src/lib/team-progress/speed-trends.test.ts src/app/api/leaderboard/historical/route.test.ts
```

Expected: PASS

**Step 2: Fix any failure from the old Max Velocity mph-key assumption**

Search for `getVelocityMetricKeys` in `src/lib/team-progress` and `src/app/api`. Max Velocity call sites must use `BuildIn`. Leave `getVelocityMetricKeys` in place for any screen this plan does not name.

**Step 3: Commit if Step 2 changed files**

```bash
git add -u
git commit -m "fix: keep max velocity on build-in rows only"
```

Skip the commit when Step 2 changed nothing.

---

## Out of scope

Saving or migrating sprints. Drop-off. Resisted sleds. A stored `MaxVelocity` row. Spanning flies on leader lines, the scatter plot, or Speed trends.
