# Testing-Day Ranking, Derived Sprint Columns, and Dual PDFs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rank the testing-day board by gender-pool 10-8-7-6-4-3-2-1 points (sprint family averaged), show derived 20yd and Max Velocity columns, add Max Velocity to norms, and download coach/athlete PDFs.

**Architecture:** Pure functions in `src/lib/norms/` compute derived marks, gender ranks, sprint averages, and audience filtering. `GET /api/reporting/testing-day` stays the single board builder. PDFs use `@react-pdf/renderer` the same way weight-room reports do (`renderToBuffer` + coach-auth route). The on-screen table reads ranks from the board payload.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, `@react-pdf/renderer`, SWR, Tailwind 4.

**Design:** [2026-09-02-testing-day-ranking-design.md](./2026-09-02-testing-day-ranking-design.md)

**Prerequisite:** Implement from a dedicated git worktree (`@using-git-worktrees`). `.worktrees/` does not exist yet and is not in `.gitignore` — add `.worktrees/` to `.gitignore` before creating a local worktree. Follow `@test-driven-development` on every task.

---

## Reference: existing code to mirror

| Concern | File |
|--------|------|
| Board types + matrix | `src/lib/norms/testing-day.ts` |
| Board API | `src/app/api/reporting/testing-day/route.ts` (`getTestingDayBoard`) |
| On-screen table | `src/app/reporting/testing-day/TestingDayClient.tsx` |
| mph from yard splits | `src/lib/norms/forty-yd.ts` (`mphFromYardSplit`, `yardsInFortyComponent`) |
| Hide poor/developmental | `src/lib/norms/leaderboard-zones.ts` (`forPublicLeaderboard`) |
| Synthetic Max Velocity key | `src/lib/velocity-metrics.ts` (`getMaxVelocityKey()` → `"MaxVelocity"`) |
| Norms metric list | `src/lib/norms/editor-metrics.ts` |
| Known-metric gate | `src/lib/norms/editor.ts` (`isKnownMetricKey`) |
| PDF buffer + download route | `src/lib/weight-room/report-pdf.tsx`, `src/app/api/weight-room/reports/team/route.ts` |
| Client PDF save | `src/app/weight-room/reports/ReportsClient.tsx` (`downloadPdfBlob`) |
| 40yd/20yd stored as seconds | `src/lib/parser.test.ts` (`units === "s"` for all yard components) |

**Do not** change `/api/reporting/export` (date-range CSV). **Do not** attach Max Velocity zones on historical/PR/live boards this pass.

---

## Constants (single source)

Put scoring constants in `src/lib/norms/testing-day-rank.ts`:

```typescript
export const PLACE_POINTS = [10, 8, 7, 6, 4, 3, 2, 1] as const;

export const SPRINT_FAMILY_METRIC_KEYS = [
  "40yd_Dash",
  "20yd_Dash",
  "MaxVelocity",
] as const;

export const TOTAL_COLUMN_KEY = "total";
```

Reuse existing keys: `TWENTY_YD_DASH`, `FORTY_YD_DASH`, `TWENTY_YD_PRIMARY_COMPONENT` (`0-20yd`), `FORTY_YD_PRIMARY_COMPONENT` (`0-40yd`) from `src/lib/norms/editor-metrics.ts`. Max Velocity key from `getMaxVelocityKey()`.

---

### Task 1: Place points and gender-pool ranking

**Files:**
- Create: `src/lib/norms/testing-day-rank.ts`
- Create: `src/lib/norms/testing-day-rank.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  formatPlace,
  pointsForPlace,
  rankMarksWithinGender,
} from "./testing-day-rank";

describe("pointsForPlace", () => {
  it("maps 1–8 to 10-8-7-6-4-3-2-1 and 9+ to 0", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(pointsForPlace)).toEqual([
      10, 8, 7, 6, 4, 3, 2, 1, 0, 0,
    ]);
  });
});

describe("rankMarksWithinGender", () => {
  it("ranks men and women separately with competition ties", () => {
    const ranked = rankMarksWithinGender(
      [
        { athlete_id: "m1", gender: "M", display_value: 4.5 },
        { athlete_id: "m2", gender: "M", display_value: 4.5 },
        { athlete_id: "m3", gender: "M", display_value: 4.7 },
        { athlete_id: "f1", gender: "F", display_value: 5.0 },
        { athlete_id: "u1", gender: null, display_value: 4.4 },
      ],
      true
    );
    const byId = Object.fromEntries(ranked.map((r) => [r.athlete_id, r]));
    expect(byId.m1).toMatchObject({ rank: 1, tied: true, points: 10 });
    expect(byId.m2).toMatchObject({ rank: 1, tied: true, points: 10 });
    expect(byId.m3).toMatchObject({ rank: 3, tied: false, points: 7 });
    expect(byId.f1).toMatchObject({ rank: 1, tied: false, points: 10 });
    expect(byId.u1).toMatchObject({ rank: 1, tied: false, points: 10 });
  });

  it("ranks higher mph better", () => {
    const ranked = rankMarksWithinGender(
      [
        { athlete_id: "a", gender: "M", display_value: 20.1 },
        { athlete_id: "b", gender: "M", display_value: 21.4 },
      ],
      false
    );
    expect(ranked.find((r) => r.athlete_id === "b")?.rank).toBe(1);
    expect(ranked.find((r) => r.athlete_id === "a")?.rank).toBe(2);
  });
});

describe("formatPlace", () => {
  it("uses ordinals and a T- prefix on ties", () => {
    expect(formatPlace(1, false)).toBe("1st");
    expect(formatPlace(2, true)).toBe("T-2nd");
    expect(formatPlace(3, false)).toBe("3rd");
    expect(formatPlace(11, false)).toBe("11th");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-rank.test.ts`

Expected: FAIL — cannot find module `./testing-day-rank`

**Step 3: Write minimal implementation**

```typescript
export const PLACE_POINTS = [10, 8, 7, 6, 4, 3, 2, 1] as const;

export type GenderPool = "M" | "F" | "U";

export function genderPool(
  gender: "M" | "F" | null | undefined
): GenderPool {
  return gender === "M" || gender === "F" ? gender : "U";
}

export function pointsForPlace(place: number): number {
  if (place < 1 || place > 8) return 0;
  return PLACE_POINTS[place - 1];
}

export type RankMarkInput = {
  athlete_id: string;
  gender: "M" | "F" | null;
  display_value: number;
};

export type RankedMark = RankMarkInput & {
  rank: number;
  tied: boolean;
  points: number;
};

export function rankMarksWithinGender(
  marks: RankMarkInput[],
  lowerIsBetter: boolean
): RankedMark[] {
  const buckets = new Map<GenderPool, RankMarkInput[]>();
  for (const mark of marks) {
    const pool = genderPool(mark.gender);
    const list = buckets.get(pool) ?? [];
    list.push(mark);
    buckets.set(pool, list);
  }

  const out: RankedMark[] = [];
  for (const poolMarks of buckets.values()) {
    const sorted = poolMarks.toSorted((a, b) => {
      if (a.display_value !== b.display_value) {
        return lowerIsBetter
          ? a.display_value - b.display_value
          : b.display_value - a.display_value;
      }
      return a.athlete_id.localeCompare(b.athlete_id);
    });
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (
        j < sorted.length &&
        sorted[j].display_value === sorted[i].display_value
      ) {
        j += 1;
      }
      const place = i + 1;
      const tied = j - i > 1;
      const points = pointsForPlace(place);
      for (let k = i; k < j; k++) {
        out.push({ ...sorted[k], rank: place, tied, points });
      }
      i = j;
    }
  }
  return out;
}

export function formatPlace(place: number, tied: boolean): string {
  const j = place % 10;
  const k = place % 100;
  let suffix = "th";
  if (j === 1 && k !== 11) suffix = "st";
  else if (j === 2 && k !== 12) suffix = "nd";
  else if (j === 3 && k !== 13) suffix = "rd";
  return `${tied ? "T-" : ""}${place}${suffix}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/norms/testing-day-rank.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/testing-day-rank.ts src/lib/norms/testing-day-rank.test.ts
git commit -m "feat: add gender-pool testing-day place points"
```

---

### Task 2: Sprint average, totals, and row order

**Files:**
- Modify: `src/lib/norms/testing-day-rank.ts`
- Modify: `src/lib/norms/testing-day-rank.test.ts`

**Step 1: Write the failing test**

Append:

```typescript
import {
  compareScoredAthletes,
  isSprintFamilyMetric,
  scoreAthleteTotals,
} from "./testing-day-rank";

describe("scoreAthleteTotals", () => {
  it("averages sprint-family points and adds other tests", () => {
    const totals = scoreAthleteTotals({
      "40yd_Dash": 10,
      "20yd_Dash": 8,
      MaxVelocity: 6,
      "Vertical Jump": 7,
    });
    expect(totals.sprint_points).toBeCloseTo(8);
    expect(totals.total_points).toBeCloseTo(15);
  });

  it("omits missing sprint factors instead of treating them as 0", () => {
    const totals = scoreAthleteTotals({
      "40yd_Dash": 10,
      "Vertical Jump": 8,
    });
    expect(totals.sprint_points).toBe(10);
    expect(totals.total_points).toBe(18);
  });
});

describe("compareScoredAthletes", () => {
  it("sorts by total, then 40 rank, then 20 rank, then name", () => {
    const a = {
      athlete_id: "a",
      first_name: "Ann",
      last_name: "Zed",
      total_points: 18,
      rank_40: 2,
      rank_20: 1,
    };
    const b = {
      athlete_id: "b",
      first_name: "Bea",
      last_name: "Aye",
      total_points: 18,
      rank_40: 1,
      rank_20: 3,
    };
    expect(compareScoredAthletes(a, b, true, true)).toBeGreaterThan(0);
    expect(isSprintFamilyMetric("40yd_Dash")).toBe(true);
    expect(isSprintFamilyMetric("Vertical Jump")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-rank.test.ts`

Expected: FAIL — `scoreAthleteTotals` is not exported

**Step 3: Write minimal implementation**

```typescript
export const SPRINT_FAMILY_METRIC_KEYS = [
  "40yd_Dash",
  "20yd_Dash",
  "MaxVelocity",
] as const;

export function isSprintFamilyMetric(metricKey: string): boolean {
  return (SPRINT_FAMILY_METRIC_KEYS as readonly string[]).includes(metricKey);
}

export function scoreAthleteTotals(
  pointsByMetric: Record<string, number>
): { sprint_points: number; total_points: number } {
  const sprint: number[] = [];
  let other = 0;
  for (const [key, points] of Object.entries(pointsByMetric)) {
    if (isSprintFamilyMetric(key)) sprint.push(points);
    else other += points;
  }
  const sprint_points =
    sprint.length === 0
      ? 0
      : sprint.reduce((sum, n) => sum + n, 0) / sprint.length;
  return { sprint_points, total_points: sprint_points + other };
}

export type ScoredSortRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  total_points: number;
  rank_40: number | null;
  rank_20: number | null;
};

export function compareScoredAthletes(
  a: ScoredSortRow,
  b: ScoredSortRow,
  has40: boolean,
  has20: boolean
): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  if (has40) {
    const ar = a.rank_40 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_40 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
  }
  if (has20) {
    const ar = a.rank_20 ?? Number.POSITIVE_INFINITY;
    const br = b.rank_20 ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
  }
  return (
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name) ||
    a.athlete_id.localeCompare(b.athlete_id)
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/norms/testing-day-rank.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/testing-day-rank.ts src/lib/norms/testing-day-rank.test.ts
git commit -m "feat: average sprint-family points into testing-day totals"
```

---

### Task 3: Derived 20yd and Max Velocity picks

**Files:**
- Create: `src/lib/norms/testing-day-derived.ts`
- Create: `src/lib/norms/testing-day-derived.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  pickBestMaxVelocityHits,
  pickBestTwentyYdHits,
} from "./testing-day-derived";

const base = {
  first_name: "A",
  last_name: "B",
  gender: "M" as const,
};

describe("pickBestTwentyYdHits", () => {
  it("keeps the faster of standalone 20 and 40 0-20 split", () => {
    const hits = pickBestTwentyYdHits([
      {
        ...base,
        athlete_id: "a",
        metric_key: "20yd_Dash",
        component: "0-20yd",
        display_value: 2.9,
      },
      {
        ...base,
        athlete_id: "a",
        metric_key: "40yd_Dash",
        component: "0-20yd",
        display_value: 2.75,
      },
      {
        ...base,
        athlete_id: "b",
        metric_key: "40yd_Dash",
        component: "0-40yd",
        display_value: 5.0,
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ athlete_id: "a", display_value: 2.75 });
  });
});

describe("pickBestMaxVelocityHits", () => {
  it("converts fly splits to mph and keeps the fastest", () => {
    const hits = pickBestMaxVelocityHits([
      {
        ...base,
        athlete_id: "a",
        metric_key: "40yd_Dash",
        component: "20-40yd",
        display_value: 2.0,
      },
      {
        ...base,
        athlete_id: "a",
        metric_key: "20yd_Dash",
        component: "10-20yd",
        display_value: 1.2,
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].athlete_id).toBe("a");
    expect(hits[0].display_value).toBeCloseTo(20.45, 5);
  });
});
```

`20.45` is `mphFromYardSplit(2.0, 20)` (20–40yd). `mphFromYardSplit(1.2, 10)` is `20.45 / 1.2 ≈ 17.04`, so the 40 fly wins.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-derived.test.ts`

Expected: FAIL — cannot find module

**Step 3: Write minimal implementation**

```typescript
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "./editor-metrics";
import { mphFromYardSplit, yardsInFortyComponent } from "./forty-yd";
import { pickBestTestingDayHits, type TestingDayHit } from "./testing-day";

export type DerivedSplitRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  metric_key: string;
  component: string | null;
  display_value: number;
};

function asHit(row: DerivedSplitRow, display_value: number): TestingDayHit {
  return {
    athlete_id: row.athlete_id,
    first_name: row.first_name,
    last_name: row.last_name,
    gender: row.gender,
    display_value,
  };
}

export function pickBestTwentyYdHits(rows: DerivedSplitRow[]): TestingDayHit[] {
  const candidates = rows
    .filter(
      (row) =>
        row.component === "0-20yd" &&
        (row.metric_key === TWENTY_YD_DASH || row.metric_key === FORTY_YD_DASH)
    )
    .map((row) => asHit(row, row.display_value));
  return pickBestTestingDayHits(candidates, true);
}

export function pickBestMaxVelocityHits(
  rows: DerivedSplitRow[]
): TestingDayHit[] {
  const candidates: TestingDayHit[] = [];
  for (const row of rows) {
    const from40 =
      row.metric_key === FORTY_YD_DASH && row.component === "20-40yd";
    const from20 =
      row.metric_key === TWENTY_YD_DASH && row.component === "10-20yd";
    if (!from40 && !from20) continue;
    const yards = yardsInFortyComponent(row.component);
    const mph = yards != null ? mphFromYardSplit(row.display_value, yards) : null;
    if (mph == null) continue;
    candidates.push(asHit(row, mph));
  }
  return pickBestTestingDayHits(candidates, false);
}
```

Yard 40/20 fly splits are stored in **seconds** (`parser.test.ts`). Always convert; do not treat `display_value` as mph.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/norms/testing-day-derived.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/testing-day-derived.ts src/lib/norms/testing-day-derived.test.ts
git commit -m "feat: pick best testing-day 20yd and max-velocity marks"
```

---

### Task 4: Score a testing-day matrix

**Files:**
- Modify: `src/lib/norms/testing-day.ts` (extend cell/athlete/column types)
- Modify: `src/lib/norms/testing-day-rank.ts` (add `scoreTestingDayMatrix`)
- Modify: `src/lib/norms/testing-day-rank.test.ts`

**Step 1: Extend types in `testing-day.ts`**

```typescript
export type TestingDayColumnKind =
  | "test"
  | "derived_20yd"
  | "derived_max_v"
  | "total";

export type TestingDayMatrixColumn = {
  key: string;
  metric_key: string;
  display_name: string;
  component: string | null;
  units: string;
  kind?: TestingDayColumnKind;
};

export type TestingDayMatrixCell = {
  display_value: number;
  zone_label?: string;
  zone_color?: string;
  rank?: number | null;
  tied?: boolean;
  points?: number;
};

export type TestingDayMatrixAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | null;
  sport: string | null;
  cells: Record<string, TestingDayMatrixCell>;
  sprint_points?: number;
  total_points?: number;
};
```

Keep `kind` optional so existing `buildTestingDayMatrix` tests still typecheck. Default missing `kind` to `"test"` inside the scorer.

**Step 2: Write the failing test**

```typescript
import { scoreTestingDayMatrix, TOTAL_COLUMN_KEY } from "./testing-day-rank";
import { testingDayColumnKey, type TestingDayMatrix } from "./testing-day";

describe("scoreTestingDayMatrix", () => {
  it("writes per-cell ranks and sorts by total then 40yd rank", () => {
    const forty = testingDayColumnKey("40yd_Dash", "0-40yd");
    const vj = testingDayColumnKey("Vertical Jump", null);
    const matrix: TestingDayMatrix = {
      columns: [
        {
          key: forty,
          metric_key: "40yd_Dash",
          display_name: "40yd Dash",
          component: "0-40yd",
          units: "s",
        },
        {
          key: vj,
          metric_key: "Vertical Jump",
          display_name: "Vertical Jump",
          component: null,
          units: "in",
        },
      ],
      athletes: [
        {
          athlete_id: "slow",
          first_name: "Sam",
          last_name: "Slow",
          gender: "M",
          sport: "football",
          cells: {
            [forty]: { display_value: 5.2 },
            [vj]: { display_value: 30 },
          },
        },
        {
          athlete_id: "fast",
          first_name: "Fay",
          last_name: "Fast",
          gender: "M",
          sport: "football",
          cells: {
            [forty]: { display_value: 4.6 },
            [vj]: { display_value: 28 },
          },
        },
      ],
    };

    const scored = scoreTestingDayMatrix(matrix);
    expect(scored.athletes.map((a) => a.athlete_id)).toEqual(["fast", "slow"]);
    expect(scored.athletes[0].cells[forty]?.rank).toBe(1);
    expect(scored.athletes[0].cells[forty]?.points).toBe(10);
    expect(scored.athletes[0].total_points).toBe(18);
    expect(scored.columns.at(-1)?.key).toBe(TOTAL_COLUMN_KEY);
    expect(scored.athletes[0].cells[TOTAL_COLUMN_KEY]?.display_value).toBe(18);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-rank.test.ts`

Expected: FAIL — `scoreTestingDayMatrix` is not exported

**Step 4: Write minimal implementation**

```typescript
import {
  FORTY_YD_DASH,
  FORTY_YD_PRIMARY_COMPONENT,
  TWENTY_YD_DASH,
} from "./editor-metrics";
import type { TestingDayMatrix, TestingDayMatrixColumn } from "./testing-day";

export const TOTAL_COLUMN_KEY = "total";

export function scoreTestingDayMatrix(matrix: TestingDayMatrix): TestingDayMatrix {
  const scoringColumns = matrix.columns.filter((c) => c.kind !== "total");
  const athletes = matrix.athletes.map((athlete) => ({
    ...athlete,
    cells: { ...athlete.cells },
  }));

  for (const column of scoringColumns) {
    const marks = athletes
      .filter((athlete) => athlete.cells[column.key])
      .map((athlete) => ({
        athlete_id: athlete.athlete_id,
        gender: athlete.gender,
        display_value: athlete.cells[column.key].display_value,
      }));
    const lowerIsBetter = (column.units ?? "").toLowerCase() === "s";
    const ranked = rankMarksWithinGender(marks, lowerIsBetter);
    const byId = new Map(ranked.map((row) => [row.athlete_id, row]));
    for (const athlete of athletes) {
      const cell = athlete.cells[column.key];
      const row = byId.get(athlete.athlete_id);
      if (!cell || !row) continue;
      athlete.cells[column.key] = {
        ...cell,
        rank: row.rank,
        tied: row.tied,
        points: row.points,
      };
    }
  }

  const fortyKey = scoringColumns.find(
    (c) =>
      c.metric_key === FORTY_YD_DASH && c.component === FORTY_YD_PRIMARY_COMPONENT
  )?.key;
  const twentyKey = scoringColumns.find((c) => c.metric_key === TWENTY_YD_DASH)
    ?.key;

  for (const athlete of athletes) {
    const pointsByMetric: Record<string, number> = {};
    for (const column of scoringColumns) {
      const points = athlete.cells[column.key]?.points;
      if (points == null) continue;
      pointsByMetric[column.metric_key] = points;
    }
    const totals = scoreAthleteTotals(pointsByMetric);
    athlete.sprint_points = totals.sprint_points;
    athlete.total_points = totals.total_points;
    athlete.cells[TOTAL_COLUMN_KEY] = { display_value: totals.total_points };
  }

  athletes.sort((a, b) =>
    compareScoredAthletes(
      {
        athlete_id: a.athlete_id,
        first_name: a.first_name,
        last_name: a.last_name,
        total_points: a.total_points ?? 0,
        rank_40: fortyKey ? (a.cells[fortyKey]?.rank ?? null) : null,
        rank_20: twentyKey ? (a.cells[twentyKey]?.rank ?? null) : null,
      },
      {
        athlete_id: b.athlete_id,
        first_name: b.first_name,
        last_name: b.last_name,
        total_points: b.total_points ?? 0,
        rank_40: fortyKey ? (b.cells[fortyKey]?.rank ?? null) : null,
        rank_20: twentyKey ? (b.cells[twentyKey]?.rank ?? null) : null,
      },
      Boolean(fortyKey),
      Boolean(twentyKey)
    )
  );

  const totalColumn: TestingDayMatrixColumn = {
    key: TOTAL_COLUMN_KEY,
    metric_key: TOTAL_COLUMN_KEY,
    display_name: "Total",
    component: null,
    units: "pts",
    kind: "total",
  };

  return { columns: [...scoringColumns, totalColumn], athletes };
}
```

**Step 5: Run tests**

Run: `npx vitest run src/lib/norms/testing-day-rank.test.ts src/lib/norms/testing-day.test.ts`

Expected: PASS (existing matrix test still sorts by name inside `buildTestingDayMatrix`; scorer re-sorts later)

**Step 6: Commit**

```bash
git add src/lib/norms/testing-day.ts src/lib/norms/testing-day-rank.ts src/lib/norms/testing-day-rank.test.ts
git commit -m "feat: score and sort the testing-day matrix"
```

---

### Task 5: Merge derived columns into the board API

**Files:**
- Modify: `src/lib/norms/testing-day-derived.ts` (add `mergeDerivedSprintColumns`)
- Modify: `src/lib/norms/testing-day-derived.test.ts`
- Modify: `src/app/api/reporting/testing-day/route.ts`

**Step 1: Write the failing test**

```typescript
import { mergeDerivedSprintColumns } from "./testing-day-derived";
import { testingDayColumnKey } from "./testing-day";

describe("mergeDerivedSprintColumns", () => {
  it("adds 20yd after 40yd and Max Velocity after the sprint pair", () => {
    const fortyKey = testingDayColumnKey("40yd_Dash", "0-40yd");
    const { columns, hitsByColumn } = mergeDerivedSprintColumns({
      columns: [
        {
          key: fortyKey,
          metric_key: "40yd_Dash",
          display_name: "40yd Dash",
          component: "0-40yd",
          units: "s",
          kind: "test",
        },
      ],
      hitsByColumn: {
        [fortyKey]: [
          {
            athlete_id: "a",
            first_name: "A",
            last_name: "B",
            gender: "M",
            display_value: 5.0,
          },
        ],
      },
      rawEntries: [
        {
          athlete_id: "a",
          first_name: "A",
          last_name: "B",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "0-20yd",
          display_value: 2.8,
        },
        {
          athlete_id: "a",
          first_name: "A",
          last_name: "B",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.1,
        },
      ],
    });

    expect(columns.map((c) => c.metric_key)).toEqual([
      "40yd_Dash",
      "20yd_Dash",
      "MaxVelocity",
    ]);
    const twentyKey = testingDayColumnKey("20yd_Dash", "0-20yd");
    const maxVKey = testingDayColumnKey("MaxVelocity", null);
    expect(hitsByColumn[twentyKey][0].display_value).toBe(2.8);
    expect(hitsByColumn[maxVKey][0].display_value).toBeCloseTo(40.9 / 2.1, 5);
  });
});
```

This helper only merges **un-zoned** hits. The route applies zones after merge (20yd with `20yd_Dash` / `0-20yd`; Max V with `MaxVelocity` / `null` / `lowerIsBetter: false`).

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-derived.test.ts`

Expected: FAIL — `mergeDerivedSprintColumns` is not exported

**Step 3: Implement `mergeDerivedSprintColumns`**

Logic:

1. Start from `columns` / `hitsByColumn` copies.
2. If `pickBestTwentyYdHits(rawEntries)` is non-empty: remove any existing `20yd_Dash` column, insert a `20yd_Dash` / `0-20yd` / `s` column immediately after `40yd_Dash` (or at preferred-order index if no 40). Set `kind` to `"derived_20yd"` when no standalone `20yd_Dash` `0-20yd` row exists; otherwise `"test"`.
3. If `pickBestMaxVelocityHits(rawEntries)` is non-empty: insert `MaxVelocity` / `null` / `mph` / `kind: "derived_max_v"` after the 20yd column (or after 40 if no 20).
4. Return updated columns + hits.

Use `getMaxVelocityKey()` for the metric key and display name `"Max Velocity"`.

**Step 4: Wire `getTestingDayBoard` in `route.ts`**

After the existing primary-column loop, before `buildTestingDayMatrix`:

1. Map `rawEntries` to `{ ..., display_value: Number(...) }`.
2. `const merged = mergeDerivedSprintColumns({ columns, hitsByColumn, rawEntries: mapped })`.
3. If a Max Velocity column exists, also fetch / include `norm_thresholds` and `norm_sport_defaults` for `MaxVelocity` (extend the existing `metricKeys` arrays **or** run a second small query). Apply `applyLeaderboardZones` with `metricKey: getMaxVelocityKey()`, `component: null`, `lowerIsBetter: false`.
4. If the 20yd column was rebuilt from mixed sources, re-apply 20yd zones on the merged hits (`metricKey: "20yd_Dash"`, `component: "0-20yd"`, `lowerIsBetter: true`).
5. `matrix: scoreTestingDayMatrix(buildTestingDayMatrix({ columns: merged.columns, hitsByColumn: merged.hitsByColumn, memberships }))`.

If a 20yd summary `tests[]` entry already exists from the primary loop, replace its hits/groups with the merged 20yd column. Add a Max Velocity `tests[]` entry (groups via `summarizeTestingDay`) so the **coach** summary block can show it.

**Step 5: Run tests**

Run: `npx vitest run src/lib/norms/testing-day-derived.test.ts src/lib/norms/testing-day.test.ts src/lib/norms/testing-day-rank.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/norms/testing-day-derived.ts src/lib/norms/testing-day-derived.test.ts src/app/api/reporting/testing-day/route.ts
git commit -m "feat: add derived 20yd and max-velocity testing-day columns"
```

---

### Task 6: Show ranks and totals on the testing-day page

**Files:**
- Modify: `src/app/reporting/testing-day/TestingDayClient.tsx`

**Step 1: Write a small presentational helper test (optional but preferred)**

If you add `formatTestingDayCell` next to the rank helpers, test it in `testing-day-rank.test.ts`. Otherwise skip a new file and update the client directly — the rank formatter already exists as `formatPlace`.

**Step 2: Update `MatrixCell` and the table**

- Cell: mark on the first line; `formatPlace(rank, tied)` in muted tabular text when `rank` is set; existing `ZoneMark` under that.
- Total column: format with one decimal when not an integer (`18` vs `15.3`); no badge.
- Header: keep Efficient+ on test columns; Total header is just `Total`.
- Athletes are already sorted by the API — do not re-sort by name.

```tsx
function fmtPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MatrixCell({
  cell,
  units,
  kind,
}: {
  cell: TestingDayMatrixCell | undefined;
  units: string;
  kind?: string;
}) {
  if (!cell) return <span className="text-foreground-muted">—</span>;
  if (kind === "total") {
    return (
      <span className="font-mono font-semibold tabular-nums text-foreground">
        {fmtPoints(cell.display_value)}
      </span>
    );
  }
  const label = cell.zone_label;
  const showBadge = Boolean(label && isZoneLabel(label));
  const color =
    cell.zone_color ??
    (showBadge && isZoneLabel(label) ? ZONE_COLORS[label] : undefined);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-mono tabular-nums text-foreground">
        {fmtMark(cell.display_value, units)}
      </span>
      {cell.rank != null ? (
        <span className="text-xs tabular-nums text-foreground-muted">
          {formatPlace(cell.rank, Boolean(cell.tied))}
        </span>
      ) : null}
      {showBadge && color ? <ZoneMark label={label!} color={color} /> : null}
    </div>
  );
}
```

Import `formatPlace` from `@/lib/norms/testing-day-rank`.

**Step 3: Manual check**

Run: `npm run dev` → `/reporting/testing-day` → pick a session that has 40yd splits.

Expected: 20yd and Max Velocity columns appear; rows ordered by total; each mark shows a gender place.

**Step 4: Commit**

```bash
git add src/app/reporting/testing-day/TestingDayClient.tsx
git commit -m "feat: show testing-day ranks and point totals in the matrix"
```

---

### Task 7: Max Velocity as a norms metric

**Files:**
- Modify: `src/lib/norms/editor-metrics.ts`
- Modify: `src/lib/norms/editor-metrics.test.ts`
- Modify: `src/lib/norms/editor.ts` (`isKnownMetricKey`)
- Modify: `src/lib/norms/editor.test.ts`

**Step 1: Write the failing tests**

Update `editor-metrics.test.ts` expected list to:

```typescript
[
  "Vertical Jump",
  "Standing-Broad",
  "40yd_Dash",
  "20yd_Dash",
  "MaxVelocity",
  "5-10-5_Agility",
  "OH-MB_Throw",
  "UH-MB_Throw",
]
```

Add:

```typescript
it("labels MaxVelocity and keeps its cuts component empty", () => {
  expect(metricLabel("MaxVelocity")).toBe("Max Velocity");
  expect(defaultCutsComponent("MaxVelocity")).toBe("");
  expect(cutsEditorMetrics().some((m) => m.key === "MaxVelocity")).toBe(true);
});
```

In `editor.test.ts` `parseSportDefaultPut` / `parseThresholdSliceReplace`:

```typescript
it("accepts synthetic MaxVelocity as a known norms metric", () => {
  const result = parseSportDefaultPut({
    hugo_group: "football",
    metric_key: "MaxVelocity",
    population_id: "22222222-2222-4222-8222-222222222222",
  });
  expect(result.ok).toBe(true);
});
```

Also assert `parseThresholdSliceReplace` accepts `metric_key: "MaxVelocity"` and `component: ""`.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/norms/editor-metrics.test.ts src/lib/norms/editor.test.ts`

Expected: FAIL — list mismatch / unknown metric

**Step 3: Minimal implementation**

`editor-metrics.ts`:

```typescript
import { getMaxVelocityKey } from "@/lib/velocity-metrics";

export const NORMS_DEFAULTS_METRIC_KEYS = [
  "Vertical Jump",
  "Standing-Broad",
  "40yd_Dash",
  "20yd_Dash",
  "MaxVelocity",
  "5-10-5_Agility",
  "OH-MB_Throw",
  "UH-MB_Throw",
] as const;

export function metricLabel(key: string): string {
  if (key === getMaxVelocityKey()) return "Max Velocity";
  return metrics[key]?.display_name || key;
}
```

In `cutsEditorMetrics()`, when looping `NORMS_DEFAULTS_METRIC_KEYS`, do **not** skip `MaxVelocity` just because it is missing from `metrics.json`:

```typescript
for (const key of NORMS_DEFAULTS_METRIC_KEYS) {
  if (key === getMaxVelocityKey()) {
    seen.add(key);
    out.push({ key, label: metricLabel(key) });
    continue;
  }
  if (!(key in metrics)) continue;
  seen.add(key);
  out.push({ key, label: metricLabel(key) });
}
```

Keep the mph filter on **extras** only (so fly-split mph metrics stay out).

`editor.ts`:

```typescript
import { getMaxVelocityKey } from "@/lib/velocity-metrics";

export function isKnownMetricKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value in getMetricsRegistry() || value === getMaxVelocityKey())
  );
}
```

`NormsEditor` already maps `NORMS_DEFAULTS_METRIC_KEYS` for sport defaults and `cutsEditorMetrics()` for the cuts picker — no UI rewrite. Max Velocity uses empty component (overall mph).

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/editor-metrics.test.ts src/lib/norms/editor.test.ts src/lib/norms/testing-day.test.ts`

Expected: PASS. `sortTestingDayMetricKeys` still puts intake tests first; MaxVelocity now sits with that preferred list if it ever appears as a key.

**Step 5: Commit**

```bash
git add src/lib/norms/editor-metrics.ts src/lib/norms/editor-metrics.test.ts src/lib/norms/editor.ts src/lib/norms/editor.test.ts
git commit -m "feat: add Max Velocity to normative defaults and cuts"
```

---

### Task 8: Audience filter + PDF document

**Files:**
- Create: `src/lib/norms/testing-day-pdf.tsx`
- Create: `src/lib/norms/testing-day-pdf.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  boardForAudience,
  renderTestingDayPdf,
  testingDayPdfFilename,
} from "./testing-day-pdf";
import type { TestingDayBoardData } from "./testing-day";

const poorBoard: TestingDayBoardData = {
  session_id: "s1",
  session_date: "2026-09-02",
  phase: "Preseason",
  selected_population_id: null,
  matrix: {
    columns: [
      {
        key: "Vertical Jump\0",
        metric_key: "Vertical Jump",
        display_name: "Vertical Jump",
        component: null,
        units: "in",
      },
    ],
    athletes: [
      {
        athlete_id: "a",
        first_name: "Ann",
        last_name: "Aye",
        gender: "F",
        sport: "volleyball",
        cells: {
          "Vertical Jump\0": {
            display_value: 16,
            zone_label: "poor",
            zone_color: "#dc2626",
            rank: 1,
            tied: false,
            points: 10,
          },
        },
        total_points: 10,
      },
    ],
  },
  tests: [
    {
      column_key: "Vertical Jump\0",
      metric: "Vertical Jump",
      metric_display_name: "Vertical Jump",
      component: null,
      units: "in",
      groups: [],
    },
  ],
};

describe("boardForAudience", () => {
  it("strips poor badges and summaries for athletes", () => {
    const athlete = boardForAudience(poorBoard, "athlete");
    expect(athlete.tests).toEqual([]);
    expect(athlete.matrix.athletes[0].cells["Vertical Jump\0"].zone_label).toBeUndefined();
    expect(boardForAudience(poorBoard, "coach").tests).toHaveLength(1);
  });
});

describe("testingDayPdfFilename", () => {
  it("names coach and athlete attachments", () => {
    expect(testingDayPdfFilename("2026-09-02", "coach")).toBe(
      "testing-day-2026-09-02-coach.pdf"
    );
  });
});

describe("renderTestingDayPdf", () => {
  it("renders an empty board as a PDF buffer", async () => {
    const buf = await renderTestingDayPdf({
      board: {
        ...poorBoard,
        matrix: { columns: [], athletes: [] },
        tests: [],
      },
      audience: "coach",
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-pdf.test.ts`

Expected: FAIL — cannot find module

**Step 3: Implement**

`boardForAudience`: if `athlete`, map every cell through `forPublicLeaderboard` and set `tests: []`. Coach returns the board unchanged (or a shallow copy).

PDF document — mirror `src/lib/weight-room/report-pdf.tsx`:

- `Document` / `Page` `size="LETTER"` `orientation="landscape"` (react-pdf: `<Page size="LETTER" orientation="landscape">`).
- Header: `Testing-day summary`, date, phase, `Coach` or `Athlete`.
- Table: Athlete (name + sport · gender), one column per matrix column, Total last.
- Cell text: `fmtMark` + `formatPlace` on the next line; zone label text only when `zone_label` is still present after audience filtering.
- Coach only, after the table: for each `board.tests` group, a compact block (sport · gender, n, label counts, Efficient+, unbadged names). Keep it small; landscape is for the matrix.
- Empty board: `No entries for this session.`
- Footer: `LCA Speed Journal — testing-day report`.

```typescript
export function testingDayPdfFilename(
  sessionDate: string,
  audience: "coach" | "athlete"
): string {
  return `testing-day-${sessionDate}-${audience}.pdf`;
}

export async function renderTestingDayPdf(opts: {
  board: TestingDayBoardData;
  audience: "coach" | "athlete";
}): Promise<Buffer> {
  const board = boardForAudience(opts.board, opts.audience);
  const element = (
    <TestingDayReportDocument board={board} audience={opts.audience} />
  );
  return renderToBuffer(
    element as unknown as Parameters<typeof renderToBuffer>[0]
  );
}
```

Reuse the same `as unknown as Parameters<typeof renderToBuffer>[0]` cast as weight-room.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/norms/testing-day-pdf.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf.test.ts
git commit -m "feat: render coach and athlete testing-day PDFs"
```

---

### Task 9: PDF download route

**Files:**
- Create: `src/app/api/reporting/testing-day/pdf/route.ts`

**Step 1: Implement the route (thin wrapper)**

Mirror `src/app/api/weight-room/reports/team/route.ts`:

```typescript
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience");
  if (audience !== "coach" && audience !== "athlete") {
    return NextResponse.json(
      { error: "audience must be coach or athlete" },
      { status: 400 }
    );
  }
  if (!searchParams.get("session_id")) {
    return NextResponse.json(
      { error: "Missing required query params: session_id" },
      { status: 400 }
    );
  }

  // Rebuild the board by calling the same internals as getTestingDayBoard.
  // Prefer extracting `buildTestingDayBoard(session_id, populationId)` from
  // route.ts into src/lib/norms/testing-day-board.ts if the handler is too
  // large to import. Do not HTTP-fetch yourself.

  const buffer = await renderTestingDayPdf({ board, audience });
  const filename = testingDayPdfFilename(board.session_date, audience);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

**Extract if needed:** move `getTestingDayBoard` body to `src/lib/norms/testing-day-board.ts` (`buildTestingDayBoard`) and call it from both `route.ts` files. If you extract, add a focused unit test that a 40yd-only entry list produces 20yd + Max V columns (can reuse `mergeDerivedSprintColumns` coverage and keep this extract mechanical).

Validate `population_id` with `parsePopulationIdParam` exactly as the JSON route does.

**Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors

**Step 3: Commit**

```bash
git add src/app/api/reporting/testing-day/pdf/route.ts src/app/api/reporting/testing-day/route.ts src/lib/norms/testing-day-board.ts
git commit -m "feat: add coach-auth testing-day PDF download route"
```

---

### Task 10: Download buttons on the testing-day page

**Files:**
- Modify: `src/app/reporting/testing-day/TestingDayClient.tsx`

**Step 1: Add two buttons next to Print**

Copy the `downloadPdfBlob` / `filenameFromDisposition` helpers from `src/app/weight-room/reports/ReportsClient.tsx` (YAGNI — paste locally; do not invent a shared package).

```typescript
async function downloadAudiencePdf(
  sessionId: string,
  populationId: string,
  audience: "coach" | "athlete",
  fallbackDate: string
) {
  const params = new URLSearchParams({
    session_id: sessionId,
    audience,
  });
  if (populationId) params.set("population_id", populationId);
  await downloadPdfBlob(
    `/api/reporting/testing-day/pdf?${params.toString()}`,
    `testing-day-${fallbackDate}-${audience}.pdf`
  );
}
```

Buttons:

- `Download coach PDF`
- `Download athlete PDF`

Disabled when `!board` or download is busy. Show the same red error treatment as other reporting failures. Keep the existing Print button (fallback).

**Step 2: Manual check**

1. Open a session with 40yd splits and a vertical.
2. Download coach PDF — confirm ranks, totals, poor/developmental if present, summary blocks.
3. Download athlete PDF — confirm same order/marks; no poor/developmental; no summary block; efficient+ badges still show.
4. Confirm files open and are emailable attachments (`testing-day-YYYY-MM-DD-coach.pdf`).

**Step 3: Run the full unit suite**

Run: `npm test`

Expected: PASS

**Step 4: Commit**

```bash
git add src/app/reporting/testing-day/TestingDayClient.tsx
git commit -m "feat: download coach and athlete testing-day PDFs"
```

---

## Verification checklist

- [ ] 40-only session shows 40 + 20 (from 0–20) + Max V (from 20–40 mph) + Total
- [ ] 20-only session shows 20 + Max V (from 10–20 mph) + Total; no 40 column
- [ ] Sprint score is the average of the sprint columns the athlete has; VJ/5-10-5/throws add as whole scores
- [ ] Men and women each get their own 1st–8th places
- [ ] Tied marks share place and points; next place skips
- [ ] Tied totals break on 40yd rank, then 20yd rank, then name
- [ ] Athlete PDF hides poor/developmental and the summary; coach PDF keeps both
- [ ] Norms editor lists Max Velocity on cuts + sport defaults (overall mph)
- [ ] Date-range CSV export unchanged

---

## Out of scope (do not do)

- Email send-from-app
- Max Velocity zones on historical / PR / live leaderboard
- Replacing 40yd `20-40yd` or 20yd `10-20yd` component cuts
- Changing `/api/reporting/export`
