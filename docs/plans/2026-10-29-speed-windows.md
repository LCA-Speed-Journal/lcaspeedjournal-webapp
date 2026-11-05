# Speed Windows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Log an unresisted sprint as one gated run in yards or meters, store every gate pair as an acceleration or a build-in, and rewrite existing speed rows into that shape so max-velocity, the drop-off line, and later charts all use the same window.

**Architecture:** `src/lib/speed/windows.ts` is the only place that expands gates, classifies an old metric key, names a cohort, and decides whether the 6% drop-off line applies. Saves and the migration both call it. `value` stays the time in seconds. Accelerations display seconds. Build-ins display mph, derived at write time. `legacy_metric_key` and `legacy_component` keep the old name so norms, F2F, and the testing-day matrix can still find the row. New saves set those legacy fields when the window matches a known test.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates and `scripts/migrate-canonical-cumulative-entries.ts` as the script pattern), existing drop-off helpers in `src/lib/dropoff/`.

**Product source:** the speed-window design agreed in this chat. Drop-off is already committed (`docs/plans/2026-10-28-session-dropoff.md`). Do not rebuild stop reasons, lanes, payback, or the strength-versus-jump indicator. Do not change resisted sleds, hurdles, jumps, or agility.

---

## Rules the implementer must not break

- Store distances in the unit the coach logged. Convert to meters only inside the mph formula (`yards * 0.9144`, then `velocityMph` in `src/lib/conversions.ts`).
- A build-in is the max-velocity point. Do not copy it into the single `MaxVelocity` key. Cohort identity is unit + build distance (`start_distance`) + fly distance (`end_distance - start_distance`).
- One gated run writes every pair of points, including non-adjacent pairs. Points are the untimed-build mark at time 0, then each timed gate.
- Drop-off stays a 6% line on `display_value`. Short accelerations are seconds (line above the best). The 10-into-20 fly is mph (line below the best). The same distances qualify in yards and in meters: start 0 end 5, 10, 15, or 20, and start 10 end 20. `0-30`, `0-40`, `0-50`, a 5–15 fly, and a 20–40 fly stay off the line in both units.
- Attempts are repeated saves of one window. Other gates from the same run are not extra attempts.
- The last-session trend pill stays on `TIME_NEUTRAL_BAND` (0.8) and `DISTANCE_NEUTRAL_BAND` (1.5) in `src/app/api/leaderboard/route.ts`.
- Migration default is a dry-run. Do not pass `--apply` against a database in this plan. Ross runs that.
- `MaxVelocity` rows with no parseable distance are reported and left unchanged.

---

### Task 1: Window math

**Files:**
- Create: `src/lib/speed/windows.ts`
- Test: `src/lib/speed/windows.test.ts`

**Step 1: Write the failing test**

Create `src/lib/speed/windows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyLegacySpeedRow,
  expandSpeedRun,
  isShortPracticeWindow,
  mphForWindow,
  timeFromMph,
} from "./windows";

describe("expandSpeedRun", () => {
  it("writes every pair from a 40yd with gates at 10, 20, and 40", () => {
    const rows = expandSpeedRun({
      distanceUnit: "yd",
      untimedBuild: 0,
      gates: [10, 20, 40],
      cumulativeTimes: [1.7, 2.9, 4.8],
    });
    expect(rows.map((row) => [row.metric_key, row.component, row.units])).toEqual([
      ["Acceleration", "0-10yd", "s"],
      ["Acceleration", "0-20yd", "s"],
      ["Acceleration", "0-40yd", "s"],
      ["BuildIn", "10-20yd", "mph"],
      ["BuildIn", "10-40yd", "mph"],
      ["BuildIn", "20-40yd", "mph"],
    ]);
    const fly = rows.find((row) => row.component === "10-20yd")!;
    expect(fly.value).toBeCloseTo(1.2);
    expect(fly.start_distance).toBe(10);
    expect(fly.end_distance).toBe(20);
    expect(fly.display_value).toBeCloseTo(mphForWindow(10, "yd", 1.2));
  });

  it("stores a 5-15 as one fly and no acceleration", () => {
    const rows = expandSpeedRun({
      distanceUnit: "yd",
      untimedBuild: 5,
      gates: [15],
      cumulativeTimes: [1.05],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric_key: "BuildIn",
      component: "5-15yd",
      distance_unit: "yd",
      start_distance: 5,
      end_distance: 15,
      value: 1.05,
      units: "mph",
    });
  });

  it("rejects a gate that is not past the build", () => {
    expect(() =>
      expandSpeedRun({
        distanceUnit: "m",
        untimedBuild: 10,
        gates: [10],
        cumulativeTimes: [1],
      })
    ).toThrow(/past the build/);
  });
});

describe("classifyLegacySpeedRow", () => {
  it("maps a named acceleration and a meter split", () => {
    expect(classifyLegacySpeedRow({ metric_key: "10m_Accel", component: null })).toMatchObject({
      metric_key: "Acceleration",
      distance_unit: "m",
      start_distance: 0,
      end_distance: 10,
    });
    expect(classifyLegacySpeedRow({ metric_key: "5-15m_Split", component: "5-15m" })).toMatchObject({
      metric_key: "BuildIn",
      distance_unit: "m",
      start_distance: 5,
      end_distance: 15,
    });
  });

  it("maps a 40yd component and ignores a sled", () => {
    expect(classifyLegacySpeedRow({ metric_key: "40yd_Dash", component: "20-40yd" })).toMatchObject({
      metric_key: "BuildIn",
      distance_unit: "yd",
      start_distance: 20,
      end_distance: 40,
    });
    expect(classifyLegacySpeedRow({ metric_key: "10m_Light-Sled", component: null })).toBeNull();
    expect(classifyLegacySpeedRow({ metric_key: "MaxVelocity", component: null })).toBeNull();
  });
});

describe("mph helpers", () => {
  it("turns 10 yards in 1 second into about 20.45 mph", () => {
    expect(mphForWindow(10, "yd", 1)).toBeCloseTo(20.455, 2);
  });

  it("recovers the time from that mph", () => {
    const mph = mphForWindow(10, "yd", 1.2);
    expect(timeFromMph(10, "yd", mph)).toBeCloseTo(1.2, 5);
  });
});

describe("isShortPracticeWindow", () => {
  it("includes the short accelerations and the 10-into-20 fly in both units", () => {
    expect(isShortPracticeWindow({ distance_unit: "yd", start_distance: 0, end_distance: 10 })).toBe(true);
    expect(isShortPracticeWindow({ distance_unit: "m", start_distance: 10, end_distance: 20 })).toBe(true);
    expect(isShortPracticeWindow({ distance_unit: "yd", start_distance: 0, end_distance: 40 })).toBe(false);
    expect(isShortPracticeWindow({ distance_unit: "yd", start_distance: 5, end_distance: 15 })).toBe(false);
    expect(isShortPracticeWindow({ distance_unit: "m", start_distance: 20, end_distance: 40 })).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/windows.test.ts`

Expected: FAIL with `expandSpeedRun` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/speed/windows.ts`:

```ts
import { velocityMph } from "@/lib/conversions";

export const ACCELERATION_KEY = "Acceleration";
export const BUILD_IN_KEY = "BuildIn";
const YARDS_TO_METERS = 0.9144;

export type DistanceUnit = "m" | "yd";

export type SpeedWindow = {
  metric_key: typeof ACCELERATION_KEY | typeof BUILD_IN_KEY;
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
  component: string;
};

export type SpeedRunRow = SpeedWindow & {
  value: number;
  display_value: number;
  units: "s" | "mph";
  interval_index: null;
};

export type SpeedRunInput = {
  distanceUnit: DistanceUnit;
  untimedBuild: number;
  gates: number[];
  cumulativeTimes: number[];
};

const LEGACY_SPEED_KEYS = new Set([
  "5m_Accel",
  "10m_Accel",
  "15m_Accel",
  "20m_Accel",
  "30m_Accel",
  "5-10m_Split",
  "5-15m_Split",
  "10-20m_Split",
  "20-30m_Split",
  "10-30m_Split",
  "20-40m_Split",
  "30-50m_Split",
  "40-60m_Split",
  "30-40m_Split",
  "40-50m_Split",
  "30-45m_Split",
  "45-55m_Split",
  "40m_Sprint",
  "50m_Sprint",
  "20yd_Dash",
  "40yd_Dash",
]);

export function flyDistance(start: number, end: number): number {
  return end - start;
}

export function distanceMeters(distance: number, unit: DistanceUnit): number {
  return unit === "yd" ? distance * YARDS_TO_METERS : distance;
}

export function mphForWindow(fly: number, unit: DistanceUnit, timeS: number): number {
  return velocityMph(distanceMeters(fly, unit), timeS);
}

export function timeFromMph(fly: number, unit: DistanceUnit, mph: number): number {
  if (mph <= 0) throw new Error("Cannot recover a time from a non-positive mph");
  return (distanceMeters(fly, unit) * 2.237) / mph;
}

export function windowLabel(start: number, end: number, unit: DistanceUnit): string {
  return `${start}-${end}${unit}`;
}

export function isShortPracticeWindow(window: {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
}): boolean {
  const { start_distance: start, end_distance: end } = window;
  if (start === 0 && (end === 5 || end === 10 || end === 15 || end === 20)) return true;
  return start === 10 && end === 20;
}

function asWindow(unit: DistanceUnit, start: number, end: number): SpeedWindow {
  if (end <= start) throw new Error(`Window end ${end} must be past start ${start}`);
  const metric_key = start === 0 ? ACCELERATION_KEY : BUILD_IN_KEY;
  return {
    metric_key,
    distance_unit: unit,
    start_distance: start,
    end_distance: end,
    component: windowLabel(start, end, unit),
  };
}

function rowFromTime(window: SpeedWindow, timeS: number): SpeedRunRow {
  if (!(timeS > 0)) throw new Error("Window time must be positive");
  if (window.metric_key === ACCELERATION_KEY) {
    return { ...window, value: timeS, display_value: timeS, units: "s", interval_index: null };
  }
  const fly = flyDistance(window.start_distance, window.end_distance);
  return {
    ...window,
    value: timeS,
    display_value: mphForWindow(fly, window.distance_unit, timeS),
    units: "mph",
    interval_index: null,
  };
}

export function expandSpeedRun(input: SpeedRunInput): SpeedRunRow[] {
  const { distanceUnit, untimedBuild, gates, cumulativeTimes } = input;
  if (untimedBuild < 0) throw new Error("Untimed build cannot be negative");
  if (gates.length === 0) throw new Error("A speed run needs at least one gate");
  if (gates.length !== cumulativeTimes.length) {
    throw new Error("Gate count does not match time count");
  }
  const points = [{ distance: untimedBuild, time: 0 }];
  for (let i = 0; i < gates.length; i++) {
    const distance = gates[i];
    const time = cumulativeTimes[i];
    const prev = points[points.length - 1];
    if (!(distance > prev.distance)) {
      throw new Error(`Gate ${distance} must be past the build and in order`);
    }
    if (!(time > prev.time)) throw new Error("Times must increase at each gate");
    points.push({ distance, time });
  }
  const rows: SpeedRunRow[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const start = points[i].distance;
      const end = points[j].distance;
      if (untimedBuild > 0 && start === 0) continue;
      rows.push(rowFromTime(asWindow(distanceUnit, start, end), points[j].time - points[i].time));
    }
  }
  return rows;
}

function unitForKey(metricKey: string): DistanceUnit {
  return metricKey === "20yd_Dash" || metricKey === "40yd_Dash" ? "yd" : "m";
}

export function classifyLegacySpeedRow(row: {
  metric_key: string;
  component: string | null;
}): SpeedWindow | null {
  if (!LEGACY_SPEED_KEYS.has(row.metric_key)) return null;
  const component = row.component?.trim() ?? "";
  const labeled = component.match(/^(\d+)-(\d+)(m|yd)?$/);
  if (labeled) {
    const unit = (labeled[3] as DistanceUnit | undefined) ?? unitForKey(row.metric_key);
    return asWindow(unit, Number(labeled[1]), Number(labeled[2]));
  }
  const accel = row.metric_key.match(/^(\d+)m_Accel$/);
  if (accel) return asWindow("m", 0, Number(accel[1]));
  const split = row.metric_key.match(/^(\d+)-(\d+)m_Split$/);
  if (split) return asWindow("m", Number(split[1]), Number(split[2]));
  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/windows.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/speed/windows.ts src/lib/speed/windows.test.ts
git commit -m "feat: expand gated speed runs into acceleration and build-in windows"
```

---

### Task 2: Known-test alias

New rows and migrated rows set `legacy_metric_key` / `legacy_component` when the window is one of today's named tests. Readers that still compare `metric_key === "40yd_Dash"` keep working once they also accept the legacy fields. Custom gates such as 17–33 get a null alias.

**Files:**
- Modify: `src/lib/speed/windows.ts`
- Test: `src/lib/speed/windows.test.ts`

**Step 1: Write the failing test**

Append to `src/lib/speed/windows.test.ts`:

```ts
import { aliasForWindow, sameSpeedMark } from "./windows";

describe("aliasForWindow", () => {
  it("names the full 40 and a 10m accel", () => {
    expect(
      aliasForWindow({ distance_unit: "yd", start_distance: 0, end_distance: 40 })
    ).toEqual({ legacy_metric_key: "40yd_Dash", legacy_component: "0-40yd" });
    expect(
      aliasForWindow({ distance_unit: "m", start_distance: 0, end_distance: 10 })
    ).toEqual({ legacy_metric_key: "10m_Accel", legacy_component: "0-10m" });
    expect(
      aliasForWindow({ distance_unit: "m", start_distance: 10, end_distance: 20 })
    ).toEqual({ legacy_metric_key: "10-20m_Split", legacy_component: "10-20m" });
    expect(
      aliasForWindow({ distance_unit: "yd", start_distance: 17, end_distance: 33 })
    ).toBeNull();
  });
});

describe("sameSpeedMark", () => {
  it("matches a rewritten row by its legacy fields", () => {
    expect(
      sameSpeedMark(
        {
          metric_key: "Acceleration",
          component: "0-40yd",
          legacy_metric_key: "40yd_Dash",
          legacy_component: "0-40yd",
        },
        "40yd_Dash",
        "0-40yd"
      )
    ).toBe(true);
  });

  it("still matches a row that has not been migrated", () => {
    expect(
      sameSpeedMark(
        { metric_key: "40yd_Dash", component: "0-40yd", legacy_metric_key: null, legacy_component: null },
        "40yd_Dash",
        "0-40yd"
      )
    ).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/windows.test.ts`

Expected: FAIL with `aliasForWindow` not defined.

**Step 3: Write minimal implementation**

Add to `src/lib/speed/windows.ts`:

```ts
export type SpeedAlias = {
  legacy_metric_key: string;
  legacy_component: string;
};

const ACCEL_ENDS_M = [5, 10, 15, 20, 30];

export function aliasForWindow(window: {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
}): SpeedAlias | null {
  const { distance_unit: unit, start_distance: start, end_distance: end } = window;
  const component = windowLabel(start, end, unit);
  if (unit === "m" && start === 0 && ACCEL_ENDS_M.includes(end)) {
    return { legacy_metric_key: `${end}m_Accel`, legacy_component: component };
  }
  if (unit === "m" && start > 0) {
    const key = `${start}-${end}m_Split`;
    if (LEGACY_SPEED_KEYS.has(key)) return { legacy_metric_key: key, legacy_component: component };
  }
  if (unit === "yd" && start === 0 && end === 40) {
    return { legacy_metric_key: "40yd_Dash", legacy_component: component };
  }
  if (unit === "yd" && start === 0 && end === 20) {
    return { legacy_metric_key: "20yd_Dash", legacy_component: component };
  }
  if (unit === "yd" && (start > 0 || end === 5 || end === 10)) {
    return { legacy_metric_key: end <= 20 && start === 0 ? "20yd_Dash" : "40yd_Dash", legacy_component: component };
  }
  if (unit === "m" && start === 0 && end === 40) {
    return { legacy_metric_key: "40m_Sprint", legacy_component: component };
  }
  if (unit === "m" && start === 0 && end === 50) {
    return { legacy_metric_key: "50m_Sprint", legacy_component: component };
  }
  return null;
}

export function sameSpeedMark(
  row: {
    metric_key: string;
    component: string | null;
    legacy_metric_key?: string | null;
    legacy_component?: string | null;
  },
  metricKey: string,
  component: string | null
): boolean {
  const componentMatches = (left: string | null | undefined) =>
    component == null || component === "" || left === component;
  if (row.metric_key === metricKey && componentMatches(row.component)) return true;
  return row.legacy_metric_key === metricKey && componentMatches(row.legacy_component ?? row.component);
}
```

Yard components that are not the full 20 or full 40 (`0-10yd`, `5-15yd`, `10-20yd`, `20-40yd`) alias to `40yd_Dash`, except a pure `0-5yd` / `0-10yd` / `0-20yd` acceleration aliases to `20yd_Dash` when `end <= 20` and `start === 0`. The `5-15yd` fly (`start > 0`) aliases to `40yd_Dash`. That matches how those labels are stored today in `src/lib/norms/editor-metrics.ts`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/windows.test.ts`

Expected: PASS. If the `0-10yd` alias expectation is added, expect `20yd_Dash` / `0-10yd`.

**Step 5: Commit**

```bash
git add src/lib/speed/windows.ts src/lib/speed/windows.test.ts
git commit -m "feat: alias speed windows back to the named tests readers already use"
```

---

### Task 3: Migration planner

The planner is pure. It does not open a database. The script in Task 5 calls it.

**Files:**
- Create: `src/lib/speed/migrate.ts`
- Test: `src/lib/speed/migrate.test.ts`

**Step 1: Write the failing test**

Create `src/lib/speed/migrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planSpeedMigration, type LegacyEntry } from "./migrate";

function row(partial: Partial<LegacyEntry> & Pick<LegacyEntry, "id" | "metric_key">): LegacyEntry {
  return {
    session_id: "s1",
    athlete_id: "a1",
    component: null,
    value: 1.7,
    display_value: 1.7,
    units: "s",
    ...partial,
  };
}

describe("planSpeedMigration", () => {
  it("rewrites a 10m accel and leaves a sled alone", () => {
    const plan = planSpeedMigration([
      row({ id: "accel", metric_key: "10m_Accel" }),
      row({ id: "sled", metric_key: "10m_Light-Sled" }),
    ]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({
      id: "accel",
      metric_key: "Acceleration",
      distance_unit: "m",
      start_distance: 0,
      end_distance: 10,
      units: "s",
      legacy_metric_key: "10m_Accel",
    });
    expect(plan.skipped.map((item) => item.id)).toEqual(["sled"]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("collapses a parent split and the matching mph row", () => {
    const plan = planSpeedMigration([
      row({
        id: "parent",
        metric_key: "20m_Accel",
        component: "10-20m",
        value: 1.05,
        display_value: 1.05,
        units: "s",
      }),
      row({
        id: "split",
        metric_key: "10-20m_Split",
        component: "10-20m",
        value: 1.05,
        display_value: 21.3,
        units: "mph",
      }),
    ]);
    expect(plan.updates.map((item) => item.id)).toEqual(["split"]);
    expect(plan.updates[0].units).toBe("mph");
    expect(plan.updates[0].value).toBeCloseTo(1.05);
    expect(plan.deleteIds).toEqual(["parent"]);
  });

  it("does not collapse two flies whose times disagree", () => {
    const plan = planSpeedMigration([
      row({ id: "a", metric_key: "10-20m_Split", component: "10-20m", value: 1.0, display_value: 1.0, units: "s" }),
      row({ id: "b", metric_key: "10-20m_Split", component: "10-20m", value: 1.2, display_value: 1.2, units: "s" }),
    ]);
    expect(plan.updates).toHaveLength(2);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("reports a MaxVelocity row with no distance", () => {
    const plan = planSpeedMigration([
      row({ id: "mv", metric_key: "MaxVelocity", units: "mph", value: 21, display_value: 21 }),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.unparsed.map((item) => item.id)).toEqual(["mv"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/migrate.test.ts`

Expected: FAIL with `planSpeedMigration` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/speed/migrate.ts`:

```ts
import {
  aliasForWindow,
  classifyLegacySpeedRow,
  flyDistance,
  mphForWindow,
  timeFromMph,
  type DistanceUnit,
  type SpeedRunRow,
} from "./windows";

export type LegacyEntry = {
  id: string;
  session_id: string;
  athlete_id: string;
  metric_key: string;
  component: string | null;
  value: number;
  display_value: number;
  units: string;
};

export type SpeedUpdate = SpeedRunRow & {
  id: string;
  legacy_metric_key: string;
  legacy_component: string | null;
};

export type SpeedMigrationPlan = {
  updates: SpeedUpdate[];
  deleteIds: string[];
  skipped: LegacyEntry[];
  unparsed: LegacyEntry[];
  conflicts: { key: string; ids: string[] }[];
};

const TIME_EPSILON = 0.001;

function cohortKey(row: { session_id: string; athlete_id: string }, unit: DistanceUnit, start: number, end: number): string {
  return `${row.session_id}|${row.athlete_id}|${unit}|${start}|${end}`;
}

export function planSpeedMigration(rows: LegacyEntry[]): SpeedMigrationPlan {
  const updates: SpeedUpdate[] = [];
  const skipped: LegacyEntry[] = [];
  const unparsed: LegacyEntry[] = [];
  const groups = new Map<string, { source: LegacyEntry; timeS: number; update: SpeedUpdate }[]>();

  for (const row of rows) {
    if (row.metric_key === "MaxVelocity") {
      unparsed.push(row);
      continue;
    }
    const window = classifyLegacySpeedRow(row);
    if (!window) {
      skipped.push(row);
      continue;
    }
    const fly = flyDistance(window.start_distance, window.end_distance);
    const storedMph = row.units.trim().toLowerCase() === "mph";
    const timeS = storedMph ? timeFromMph(fly, window.distance_unit, Number(row.display_value)) : Number(row.value);
    const display = storedMph
      ? Number(row.display_value)
      : window.metric_key === "BuildIn"
        ? mphForWindow(fly, window.distance_unit, timeS)
        : timeS;
    const alias = aliasForWindow(window);
    const update: SpeedUpdate = {
      ...window,
      id: row.id,
      value: timeS,
      display_value: display,
      units: window.metric_key === "BuildIn" ? "mph" : "s",
      interval_index: null,
      legacy_metric_key: row.metric_key,
      legacy_component: row.component,
    };
    if (alias && update.legacy_component == null) update.legacy_component = alias.legacy_component;
    const key = cohortKey(row, window.distance_unit, window.start_distance, window.end_distance);
    const list = groups.get(key) ?? [];
    list.push({ source: row, timeS, update });
    groups.set(key, list);
  }

  const deleteIds: string[] = [];
  const conflicts: SpeedMigrationPlan["conflicts"] = [];
  for (const [key, list] of groups) {
    const times = list.map((item) => item.timeS);
    const agrees = times.every((time) => Math.abs(time - times[0]) <= TIME_EPSILON);
    if (!agrees) {
      conflicts.push({ key, ids: list.map((item) => item.source.id) });
      updates.push(...list.map((item) => item.update));
      continue;
    }
    const keeper = [...list].sort((a, b) => {
      const aMph = a.source.units.trim().toLowerCase() === "mph" ? 1 : 0;
      const bMph = b.source.units.trim().toLowerCase() === "mph" ? 1 : 0;
      return bMph - aMph;
    })[0];
    updates.push(keeper.update);
    for (const item of list) {
      if (item.source.id !== keeper.source.id) deleteIds.push(item.source.id);
    }
  }

  return { updates, deleteIds, skipped, unparsed, conflicts };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speed/migrate.test.ts src/lib/speed/windows.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/speed/migrate.ts src/lib/speed/migrate.test.ts
git commit -m "feat: plan the speed-window rewrite and duplicate collapse"
```

---

### Task 4: Columns

**Files:**
- Create: `scripts/migrate-speed-windows.sql`

**Step 1: Write the SQL**

```sql
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS distance_unit TEXT,
  ADD COLUMN IF NOT EXISTS start_distance NUMERIC,
  ADD COLUMN IF NOT EXISTS end_distance NUMERIC,
  ADD COLUMN IF NOT EXISTS legacy_metric_key TEXT,
  ADD COLUMN IF NOT EXISTS legacy_component TEXT;

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_distance_unit_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_distance_unit_check
  CHECK (distance_unit IS NULL OR distance_unit IN ('m', 'yd'));

CREATE INDEX IF NOT EXISTS idx_entries_speed_window
  ON entries (metric_key, distance_unit, start_distance, end_distance);
```

**Step 2: Do not apply it**

Leave the file in the repo. Task 5's script applies this file only when Ross passes `--apply`.

**Step 3: Commit**

```bash
git add scripts/migrate-speed-windows.sql
git commit -m "feat: add speed-window columns on entries"
```

---

### Task 5: Migration script

Follow `scripts/migrate-canonical-cumulative-entries.ts` for env loading and `createPool`.

**Files:**
- Create: `scripts/migrate-speed-windows.ts`

**Step 1: Write the script**

The script:

1. Loads `.env.local` the same way as `scripts/migrate-canonical-cumulative-entries.ts`.
2. Reads `scripts/migrate-speed-windows.sql`.
3. Selects `id, session_id, athlete_id, metric_key, component, value, display_value, units` from `entries` where `metric_key` is in `LEGACY_SPEED_KEYS` plus `MaxVelocity`. Export that key list from `windows.ts` as `legacySpeedKeys()` if it is not already exported. Export the set.
4. Calls `planSpeedMigration`.
5. Prints counts: updates, deletes, skipped, unparsed, conflicts. Prints every conflict and every unparsed id.
6. With no `--apply`, exits 0 after the print. Does not open a transaction and does not run the SQL file.
7. With `--apply`, runs the SQL file, then in one transaction updates each planned row and deletes `deleteIds`. Each update sets `metric_key`, `component`, `interval_index = NULL`, `value`, `display_value`, `units`, `distance_unit`, `start_distance`, `end_distance`, `legacy_metric_key`, `legacy_component`.

Export `LEGACY_SPEED_KEYS` from `windows.ts` by changing `const LEGACY_SPEED_KEYS` to `export const LEGACY_SPEED_KEYS`.

**Step 2: Typecheck the script**

Run: `npx tsc --noEmit --pretty false`

Expected: no errors in `scripts/migrate-speed-windows.ts` or `src/lib/speed/`.

Do not run the script against the database.

**Step 3: Commit**

```bash
git add scripts/migrate-speed-windows.ts src/lib/speed/windows.ts
git commit -m "feat: add a dry-run script to rewrite speed entries into windows"
```

---

### Task 6: Save a speed run

`POST /api/entries` today requires `metric_key` and `parseEntry`. A speed run sends `speed_run` instead.

**Files:**
- Modify: `src/app/api/entries/route.ts` (the `POST` handler around the `metric_key` check and the insert)
- Test: `src/lib/speed/windows.test.ts` already covers expansion. Add a route-level test only if this repo already tests route handlers without a database. It does not. Cover the insert payload with a pure helper instead.
- Create: `src/lib/speed/save-rows.ts`
- Test: `src/lib/speed/save-rows.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { rowsForSpeedRun } from "./save-rows";

describe("rowsForSpeedRun", () => {
  it("attaches the legacy alias onto each window", () => {
    const rows = rowsForSpeedRun({
      distanceUnit: "m",
      untimedBuild: 0,
      gates: [10],
      cumulativeTimes: [1.7],
    });
    expect(rows[0]).toMatchObject({
      metric_key: "Acceleration",
      legacy_metric_key: "10m_Accel",
      legacy_component: "0-10m",
      distance_unit: "m",
      start_distance: 0,
      end_distance: 10,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/save-rows.test.ts`

Expected: FAIL with `rowsForSpeedRun` not defined.

**Step 3: Write minimal implementation**

`rowsForSpeedRun` calls `expandSpeedRun` and adds `aliasForWindow(...)` fields (`legacy_metric_key: null` when the alias is null).

In `POST`, when `body.speed_run` is present:

- Require `session_id` and `athlete_id`. Do not require `metric_key`.
- `const rows = rowsForSpeedRun(body.speed_run)`.
- Insert the same columns as today, plus `distance_unit`, `start_distance`, `end_distance`, `legacy_metric_key`, `legacy_component`.
- Return `{ data: { count, ids } }` with 201, same as the existing path.
- On a thrown validation error from `expandSpeedRun`, return 400 with that message.

Leave the existing `metric_key` path unchanged so sleds, jumps, and not-yet-migrated clients still post.

**Step 4: Run tests**

Run: `npx vitest run src/lib/speed/save-rows.test.ts src/lib/speed/windows.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/speed/save-rows.ts src/lib/speed/save-rows.test.ts src/app/api/entries/route.ts
git commit -m "feat: save a gated speed run as one row per window"
```

---

### Task 7: Drop-off follows the window

Existing tests in `src/lib/dropoff/attempts.test.ts` and `src/lib/dropoff/metrics.test.ts` must stay green. Old keys still qualify. New window rows qualify by distance, in yards or meters.

**Files:**
- Modify: `src/lib/dropoff/attempts.ts`
- Modify: `src/lib/dropoff/metrics.ts`
- Test: `src/lib/dropoff/attempts.test.ts`
- Test: `src/lib/dropoff/metrics.test.ts`

**Step 1: Write the failing test**

Add to `src/lib/dropoff/metrics.test.ts`:

```ts
import { isDropoffWindow } from "./metrics";

it("treats a 10yd acceleration and a 10-20yd fly as practice marks", () => {
  expect(isDropoffWindow({ distance_unit: "yd", start_distance: 0, end_distance: 10 })).toBe(true);
  expect(isDropoffWindow({ distance_unit: "yd", start_distance: 10, end_distance: 20 })).toBe(true);
  expect(isDropoffWindow({ distance_unit: "yd", start_distance: 0, end_distance: 40 })).toBe(false);
  expect(isDropoffWindow({ distance_unit: "m", start_distance: 5, end_distance: 15 })).toBe(false);
});
```

Add to `src/lib/dropoff/attempts.test.ts` a case with two `Acceleration` rows that share `0-10yd` and one `0-20yd` row. `overallAttemptsFor` for the 0–10 window returns two values and ignores the 0–20 row. Extend `DropoffEntry` in the test with:

```ts
distance_unit?: "m" | "yd" | null;
start_distance?: number | null;
end_distance?: number | null;
```

Call:

```ts
overallAttemptsFor(entries, "a1", "Acceleration", {
  distance_unit: "yd",
  start_distance: 0,
  end_distance: 10,
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dropoff/metrics.test.ts src/lib/dropoff/attempts.test.ts`

Expected: FAIL with `isDropoffWindow` not defined.

**Step 3: Write minimal implementation**

In `src/lib/dropoff/metrics.ts`:

```ts
import { isShortPracticeWindow, type DistanceUnit } from "@/lib/speed/windows";

export function isDropoffWindow(window: {
  distance_unit: DistanceUnit;
  start_distance: number;
  end_distance: number;
}): boolean {
  return isShortPracticeWindow(window);
}
```

Keep `isDropoffMetric` and its key set unchanged.

In `attempts.ts`:

- Add the three optional distance fields to `DropoffEntry`.
- `overallAttemptsFor(entries, athleteId, metricKey, window?)`.
- When `window` is set, keep rows with that `metric_key` and the same unit, start, and end. Do not use `isOverallAttemptRow` for those rows. Each window row is the mark.
- When `window` is omitted, keep today's filter so existing tests pass.
- `isOverallDropoffView(metricKey, component, intervalIndex, window?)` returns `isDropoffWindow(window)` when `window` is set. Otherwise it keeps today's `isDropoffMetric` + `isOverallAttemptRow` check.

Update `src/app/data-entry/EntryForm.tsx` and `src/app/data-entry/session/[id]/EditSessionClient.tsx` call sites to pass the window when the entry has `distance_unit`, `start_distance`, and `end_distance`. The leaderboard attach in `src/app/api/leaderboard/route.ts` passes the same window when the request includes `distance_unit`, `start_distance`, and `end_distance` query params. The attempt query adds:

```sql
AND e.distance_unit = ${distance_unit}
AND e.start_distance = ${start_distance}
AND e.end_distance = ${end_distance}
```

when those params are present. The leaderboard's main `metric_key` filter becomes:

```sql
AND (e.metric_key = ${metric} OR e.legacy_metric_key = ${metric})
```

so a board opened on `10m_Accel` still finds a migrated row. Apply that OR anywhere this file compares `e.metric_key = ${metric}`.

**Step 4: Run tests**

Run: `npx vitest run src/lib/dropoff src/lib/speed`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/dropoff src/app/data-entry/EntryForm.tsx src/app/data-entry/session/[id]/EditSessionClient.tsx src/app/api/leaderboard/route.ts
git commit -m "feat: apply the drop-off line to short speed windows in yards and meters"
```

---

### Task 8: Readers accept the legacy alias

In-memory readers compare `metric_key` directly. A migrated row would disappear from F2F and the testing-day max-velocity column until they use `sameSpeedMark`.

**Files:**
- Modify: `src/lib/norms/testing-day-derived.ts` (`pickBestMaxVelocityHits`, `pickBestTwentyYdHits`)
- Modify: `src/lib/norms/f2f/pick-marks.ts`
- Modify: `src/lib/norms/f2f/profile.ts`
- Modify: `src/lib/norms/f2f/force-stand-in.ts` if it compares `40yd_Dash` or `20yd_Dash`
- Test: `src/lib/norms/testing-day-derived.test.ts`

**Step 1: Write the failing test**

Add one case to `pickBestMaxVelocityHits`: a row with `metric_key: "BuildIn"`, `component: "20-40yd"`, `legacy_metric_key: "40yd_Dash"`, `legacy_component: "20-40yd"`, `display_value` already in mph (`units: "mph"`). Expect a hit whose display value is that mph, not a second conversion of an mph number through `mphFromYardSplit`.

When `units` is `mph`, use `display_value` as the mph. When `units` is `s`, keep the current `mphFromYardSplit` path. That is required because Task 3 stores build-ins as mph.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-derived.test.ts`

Expected: FAIL because the BuildIn row is ignored.

**Step 3: Write minimal implementation**

Replace direct `metric_key` / `component` equality for `40yd_Dash` and `20yd_Dash` in the files listed above with `sameSpeedMark(row, key, component)`.

In `pickBestMaxVelocityHits`, if `row.units === "mph"`, push `row.display_value` and skip `mphFromYardSplit`.

Do not change fixtures that still use `metric_key: "40yd_Dash"`. `sameSpeedMark` accepts those.

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/testing-day-derived.test.ts src/lib/norms/f2f`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/norms/testing-day-derived.ts src/lib/norms/testing-day-derived.test.ts src/lib/norms/f2f/pick-marks.ts src/lib/norms/f2f/profile.ts src/lib/norms/f2f/force-stand-in.ts
git commit -m "feat: let norms read speed windows through their legacy test names"
```

---

### Task 9: Entry form

Hide the individual Acceleration and MaxV keys from session setup. Offer one Speed run control. Sleds and hurdles stay in the list.

**Files:**
- Modify: `src/lib/metric-utils.ts` (`sessionSetupMetricOptions`)
- Test: `src/lib/metric-utils.test.ts`
- Create: `src/components/speed/SpeedRunFields.tsx`
- Modify: `src/app/data-entry/EntryForm.tsx` to render `SpeedRunFields` when the selected key is `SpeedRun`, and POST `{ speed_run }` instead of `{ metric_key, raw_input }`

**Step 1: Write the failing test**

In `src/lib/metric-utils.test.ts`:

```ts
it("replaces unresisted speed keys with one Speed run option", () => {
  const options = sessionSetupMetricOptions();
  const keys = options.map((option) => option.key);
  expect(keys).toContain("SpeedRun");
  expect(keys).not.toContain("10m_Accel");
  expect(keys).not.toContain("40yd_Dash");
  expect(keys).not.toContain("10-20m_Split");
  expect(keys).toContain("10m_Light-Sled");
  expect(keys).toContain("Vertical Jump");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/metric-utils.test.ts`

Expected: FAIL because `10m_Accel` is still present and `SpeedRun` is not.

**Step 3: Write minimal implementation**

Filter out keys for which `classifyLegacySpeedRow({ metric_key: key, component: null })` returns non-null, or the key is `20yd_Dash` / `40yd_Dash` / ends with `_Split` and is in `LEGACY_SPEED_KEYS`. `classifyLegacySpeedRow` returns null for `40yd_Dash` with a null component, so also drop every key in `LEGACY_SPEED_KEYS`.

Append:

```ts
{ key: "SpeedRun", label: "Speed run", input_structure: "speed_run", default_splits: [], input_units: "s" }
```

`SpeedRunFields` is a client component:

- Unit toggle: `m` | `yd`.
- Untimed build, default `0`.
- Gates as a comma-separated list of distances from the start.
- Times as a pipe-separated cumulative list, one per gate. Placeholder tells the coach the count.
- Preset buttons that only fill those fields:
  - 10m accel: `m`, build 0, gates `10`
  - 20m accel: `m`, build 0, gates `10, 20`
  - 30m accel: `m`, build 0, gates `10, 20, 30`
  - 5–15 fly: current unit, build 5, gates `15`
  - 10–20 fly: current unit, build 10, gates `20`
  - 20–40 fly: current unit, build 20, gates `40`
  - 20yd: `yd`, build 0, gates `5, 10, 20`
  - 40yd: `yd`, build 0, gates `10, 20, 40`
  - 50m: `m`, build 0, gates `30, 40, 50`
- On submit, the parent posts `speed_run: { distanceUnit, untimedBuild, gates, cumulativeTimes }`.

Show the drop-off caption for each short window in the preview by running `expandSpeedRun` on the current fields and calling the existing drop-off summary per window from the session's saved entries. A preview that fails validation shows the error string from `expandSpeedRun` and does not post.

**Step 4: Run tests**

Run: `npx vitest run src/lib/metric-utils.test.ts src/lib/speed src/lib/dropoff`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/metric-utils.ts src/lib/metric-utils.test.ts src/components/speed/SpeedRunFields.tsx src/app/data-entry/EntryForm.tsx
git commit -m "feat: log unresisted speed as one gated run"
```

---

### Task 10: Velocity chart data

The chart draws each build-in as a horizontal segment. Default fly length is 10 of the logged unit. This task is the data helper and an SVG component. Wire it onto `AthleteDashboard` and `TeamOverviewDashboard` only after the helper tests pass.

**Files:**
- Create: `src/lib/speed/profile.ts`
- Test: `src/lib/speed/profile.test.ts`
- Create: `src/components/speed/VelocitySegments.tsx`
- Modify: `src/app/athletes/AthleteDashboard.tsx`
- Modify: `src/app/athletes/TeamOverviewDashboard.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { segmentsForFlyLength } from "./profile";

describe("segmentsForFlyLength", () => {
  it("keeps 10yd flies and drops a 30yd fly", () => {
    const segments = segmentsForFlyLength(
      [
        { start_distance: 10, end_distance: 20, distance_unit: "yd", display_value: 20 },
        { start_distance: 10, end_distance: 40, distance_unit: "yd", display_value: 22 },
      ],
      "yd",
      10
    );
    expect(segments).toEqual([
      { x1: 10, x2: 20, mph: 20 },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speed/profile.test.ts`

Expected: FAIL with `segmentsForFlyLength` not defined.

**Step 3: Write minimal implementation**

```ts
export function segmentsForFlyLength(
  rows: { start_distance: number; end_distance: number; distance_unit: "m" | "yd"; display_value: number }[],
  unit: "m" | "yd",
  flyLength: number
): { x1: number; x2: number; mph: number }[] {
  return rows
    .filter(
      (row) =>
        row.distance_unit === unit &&
        row.end_distance - row.start_distance === flyLength
    )
    .map((row) => ({ x1: row.start_distance, x2: row.end_distance, mph: row.display_value }));
}
```

`VelocitySegments` renders one `<line>` per segment in an SVG, x from `x1` to `x2`, y from mph. Highlight the segment with the highest mph. The athlete dashboard loads that athlete's `BuildIn` rows (`metric_key = 'BuildIn'`) and passes them through `segmentsForFlyLength` with fly length 10. A toggle switches fly length among the lengths present. The team dashboard does the same for the roster and draws the median mph at each `x1` for the selected fly length.

Add the fetch in the existing athlete and team data loaders. Do not add a new API route if the dashboard already receives entries. If it does not, add `GET /api/speed/profile?athlete_id=` and `GET /api/speed/profile?hugo_group=` that select `start_distance, end_distance, distance_unit, display_value, athlete_id` from `entries` where `metric_key = 'BuildIn'`.

**Step 4: Run tests**

Run: `npx vitest run src/lib/speed/profile.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/speed/profile.ts src/lib/speed/profile.test.ts src/components/speed/VelocitySegments.tsx src/app/athletes/AthleteDashboard.tsx src/app/athletes/TeamOverviewDashboard.tsx
git commit -m "feat: plot build-in velocity against distance from the start"
```

---

### Task 11: Verification

**Step 1: Run the speed, drop-off, and norms tests**

Run: `npx vitest run src/lib/speed src/lib/dropoff src/lib/norms/testing-day-derived.test.ts src/lib/norms/f2f src/lib/metric-utils.test.ts`

Expected: PASS.

**Step 2: Dry-run the migration only if `POSTGRES_URL` points at a database Ross has named**

Run: `npx tsx scripts/migrate-speed-windows.ts`

Expected: a printed count and no writes. Do not pass `--apply` in this task.

**Step 3: Do not commit an empty verification commit**
