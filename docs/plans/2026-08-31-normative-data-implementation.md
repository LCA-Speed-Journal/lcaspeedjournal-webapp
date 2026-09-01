# Normative Data Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compare Speed Journal speed/power marks against coach-editable current-stick buckets (leaderboard + reporting), add `40yd_Dash` with yard splits, add Football as a Hugo group, and dual-write confirmed card outputs into `entries`.

**Architecture:** Pure resolver and journal-post helpers in `src/lib/norms/`. Postgres holds populations, sparse thresholds, and sport→population defaults. Zones are computed at read time (never stored on `entries`). Weight-room confirm writes lifts first, then upserts journal rows only for checklist `post: true` onto a `sessions.origin = 'weight_room'` session for that date.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, SWR, NextAuth credentials (coach PIN), Vercel Postgres (`sql` from `src/lib/db.ts`), Vitest.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`). Run `npm test` and `npm run dev` from the repo root. Paths are relative to that root.

**Do not:** version threshold tables; snapshot zone onto entries; dual-write without the review checklist; attach WR tests to a same-day coach-created session; seed fake research numbers; map card cells by movement name regex; add sport-coach login; put norms on weight-room lift PDFs; add `10yd_Dash` canonical keys or mph 40yd split metrics.

**Reference:** Design [docs/plans/2026-08-31-normative-data-design.md](./2026-08-31-normative-data-design.md). Patterns: `src/lib/leaderboard-sections.test.ts`, `src/lib/weight-room/confirm-scan.ts`, `src/lib/require-coach.ts`, `src/app/api/leaderboard/route.ts`, `{ data }` / `{ error }` JSON. Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

**Gender:** roster stores `M` / `F` (see `AthleteForm`). Thresholds use the same two letters.

**Direction:** `display_units === "s"` → lower is better (same as leaderboard `sortAsc`).

---

### Task 1: Zone palette constants

**Files:**
- Create: `src/lib/norms/palette.ts`
- Test: `src/lib/norms/palette.test.ts`

**Step 1: Write the failing test**

Create `src/lib/norms/palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ZONE_LABELS,
  ZONE_COLORS,
  zoneRank,
  isZoneLabel,
} from "./palette";

describe("ZONE_LABELS", () => {
  it("is the six labels in display order worst to best", () => {
    expect(ZONE_LABELS).toEqual([
      "poor",
      "developmental",
      "efficient",
      "advanced",
      "elite",
      "world-class",
    ]);
  });
});

describe("zoneRank", () => {
  it("ranks world-class best (highest number)", () => {
    expect(zoneRank("poor")).toBeLessThan(zoneRank("efficient"));
    expect(zoneRank("elite")).toBeLessThan(zoneRank("world-class"));
  });
});

describe("isZoneLabel", () => {
  it("accepts palette keys only", () => {
    expect(isZoneLabel("elite")).toBe(true);
    expect(isZoneLabel("Efficient")).toBe(false);
    expect(isZoneLabel("")).toBe(false);
  });
});

describe("ZONE_COLORS", () => {
  it("has a color token for every label", () => {
    for (const label of ZONE_LABELS) {
      expect(ZONE_COLORS[label]).toMatch(/^#/);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/norms/palette.test.ts -v`

Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

Create `src/lib/norms/palette.ts`:

```ts
export const ZONE_LABELS = [
  "poor",
  "developmental",
  "efficient",
  "advanced",
  "elite",
  "world-class",
] as const;

export type ZoneLabel = (typeof ZONE_LABELS)[number];

/** Display hex; CSS variables in globals.css should match. */
export const ZONE_COLORS: Record<ZoneLabel, string> = {
  poor: "#dc2626",
  developmental: "#ea580c",
  efficient: "#ca8a04",
  advanced: "#16a34a",
  elite: "#2563eb",
  "world-class": "#7c3aed",
};

export function isZoneLabel(value: unknown): value is ZoneLabel {
  return typeof value === "string" && (ZONE_LABELS as readonly string[]).includes(value);
}

/** Higher = better. poor = 0 … world-class = 5. */
export function zoneRank(label: ZoneLabel): number {
  return ZONE_LABELS.indexOf(label);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/norms/palette.test.ts -v`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/palette.ts src/lib/norms/palette.test.ts
git commit -m "feat(norms): add zone label palette and colors"
```

---

### Task 2: Zone resolver

**Files:**
- Create: `src/lib/norms/resolve-zone.ts`
- Test: `src/lib/norms/resolve-zone.test.ts`

**Step 1: Write the failing test**

Create `src/lib/norms/resolve-zone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveZone } from "./resolve-zone";
import type { ZoneCut } from "./resolve-zone";

const vj: ZoneCut[] = [
  { label: "efficient", threshold: 20 },
  { label: "elite", threshold: 28 },
];

const forty: ZoneCut[] = [
  { label: "efficient", threshold: 5.0 },
  { label: "elite", threshold: 4.5 },
];

describe("resolveZone higher-is-better", () => {
  it("returns null below the easiest cut", () => {
    expect(resolveZone({ value: 18, lowerIsBetter: false, cuts: vj })).toBeNull();
  });

  it("returns efficient between cuts", () => {
    expect(resolveZone({ value: 22, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "efficient"
    );
  });

  it("returns elite at or above elite", () => {
    expect(resolveZone({ value: 28, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "elite"
    );
    expect(resolveZone({ value: 30, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "elite"
    );
  });

  it("does not require poor to be filled", () => {
    expect(resolveZone({ value: 22, lowerIsBetter: false, cuts: vj })?.label).toBe(
      "efficient"
    );
  });
});

describe("resolveZone lower-is-better", () => {
  it("returns null slower than the easiest cut", () => {
    expect(resolveZone({ value: 5.2, lowerIsBetter: true, cuts: forty })).toBeNull();
  });

  it("returns efficient at 5.0 and elite at 4.5", () => {
    expect(resolveZone({ value: 4.9, lowerIsBetter: true, cuts: forty })?.label).toBe(
      "efficient"
    );
    expect(resolveZone({ value: 4.5, lowerIsBetter: true, cuts: forty })?.label).toBe(
      "elite"
    );
    expect(resolveZone({ value: 4.4, lowerIsBetter: true, cuts: forty })?.label).toBe(
      "elite"
    );
  });
});

describe("resolveZone edges", () => {
  it("returns null for empty cuts or non-finite value", () => {
    expect(resolveZone({ value: 22, lowerIsBetter: false, cuts: [] })).toBeNull();
    expect(
      resolveZone({ value: Number.NaN, lowerIsBetter: false, cuts: vj })
    ).toBeNull();
  });

  it("includes color on a hit", () => {
    const z = resolveZone({ value: 22, lowerIsBetter: false, cuts: vj });
    expect(z?.color).toBe("#ca8a04");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/norms/resolve-zone.test.ts -v`

Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

Create `src/lib/norms/resolve-zone.ts`:

```ts
import { ZONE_COLORS, zoneRank, type ZoneLabel } from "./palette";

export type ZoneCut = { label: ZoneLabel; threshold: number };

export type ZoneHit = { label: ZoneLabel; color: string };

export function resolveZone(input: {
  value: number;
  lowerIsBetter: boolean;
  cuts: ZoneCut[];
}): ZoneHit | null {
  if (!Number.isFinite(input.value)) return null;
  const cuts = input.cuts.filter((c) => Number.isFinite(c.threshold));
  if (cuts.length === 0) return null;

  const earned: ZoneLabel[] = [];
  for (const cut of cuts) {
    const ok = input.lowerIsBetter
      ? input.value <= cut.threshold
      : input.value >= cut.threshold;
    if (ok) earned.push(cut.label);
  }
  if (earned.length === 0) return null;

  let best = earned[0];
  for (const label of earned) {
    if (zoneRank(label) > zoneRank(best)) best = label;
  }
  return { label: best, color: ZONE_COLORS[best] };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/norms/resolve-zone.test.ts -v`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/resolve-zone.ts src/lib/norms/resolve-zone.test.ts
git commit -m "feat(norms): resolve best earned zone from sparse cuts"
```

---

### Task 3: Interval unit on primary component

**Files:**
- Modify: `src/lib/metric-utils.ts`
- Modify: `src/lib/metric-utils.test.ts`
- Modify: `src/lib/canonical-cumulative.ts` (primary helper uses `m` today; keep meter metrics on `m`, support `yd`)

`getPrimaryComponent` currently always suffixes `m` (`0-40m` for `40m_Sprint`). Add optional `interval_unit` on the registry (`"m"` | `"yd"`, default `"m"`).

**Step 1: Write the failing test**

Add to `src/lib/metric-utils.test.ts`:

```ts
  it("returns 0-40yd for 40yd_Dash", () => {
    expect(getPrimaryComponent("40yd_Dash")).toBe("0-40yd");
  });
```

This will fail until Task 4 adds the metric; implement `getIntervalUnit` + suffix so unknown metrics still return null, and the test stays skipped until the metric exists — **prefer adding the metric in Task 4 first if this fails on unknown key**. If `40yd_Dash` is missing, `getPrimaryComponent` returns `null`. **Do Task 4 immediately after this helper if you split commits; or combine Task 3+4 in one commit if the test cannot pass alone.**

Implement `getIntervalUnit(metricKey)` reading `interval_unit` from registry, default `"m"`. Change `getPrimaryComponent` to `return \`0-${total}${unit}\``.

Update `src/lib/canonical-cumulative.ts` `primaryComponentForMetric` the same way (read `interval_unit` if present on `MetricDef`; extend the local type). Meter metrics must still return `0-40m`.

**Step 2–4:** Extend the `MetricDef` type in `metric-utils` via `getMetricsRegistry()`. Add tests that `20m_Accel` is still `0-20m`.

**Step 5: Commit** (if combined with Task 4, skip this commit)

```bash
git add src/lib/metric-utils.ts src/lib/metric-utils.test.ts src/lib/canonical-cumulative.ts
git commit -m "feat(metrics): suffix primary component with interval unit"
```

---

### Task 4: `40yd_Dash` metric and yard labels in parser

**Files:**
- Modify: `src/lib/metrics.json`
- Modify: `src/lib/parser.ts` (`formatIntervalLabel` takes unit; `parseCumulative` uses metric `interval_unit`)
- Modify: `src/lib/parser.test.ts`

**Step 1: Write the failing test**

Add to `src/lib/parser.test.ts`:

```ts
describe("40yd_Dash", () => {
  it("emits yard components for default splits 10+10+20", () => {
    const rows = parseEntry("40yd_Dash", "1.80|3.10|5.00");
    const components = rows.map((r) => r.component);
    expect(components).toContain("0-10yd");
    expect(components).toContain("0-20yd");
    expect(components).toContain("0-40yd");
    expect(components).toContain("10-20yd");
    expect(components).toContain("20-40yd");
    expect(components.some((c) => c?.endsWith("m"))).toBe(false);
    expect(rows.every((r) => r.metric_key === "40yd_Dash")).toBe(true);
    expect(rows.every((r) => r.units === "s")).toBe(true);
  });

  it("adds 0-5yd when session splits are 5,5,10,20", () => {
    const rows = parseEntry("40yd_Dash", "1.00|1.80|3.10|5.00", {
      day_splits: { "40yd_Dash": [5, 5, 10, 20] },
    });
    const components = rows.map((r) => r.component);
    expect(components).toContain("0-5yd");
    expect(components).toContain("0-10yd");
    expect(components).toContain("5-10yd");
    expect(components).toContain("0-40yd");
  });
});
```

Keep existing `40m_Sprint` tests: components still end in `m`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/parser.test.ts -v`

Expected: FAIL unknown metric or `m` labels

**Step 3: Write minimal implementation**

Add to `src/lib/metrics.json` (Speed / MaxV, after `40m_Sprint` is fine):

```json
  "40yd_Dash": {
    "display_name": "40yd_Dash",
    "category": "Speed",
    "subcategory": "MaxV",
    "input_units": "s",
    "display_units": "s",
    "conversion_formula": "",
    "input_structure": "cumulative",
    "default_splits": [10, 10, 20],
    "interval_unit": "yd"
  },
```

In `src/lib/parser.ts`:

- Add `interval_unit?: "m" | "yd"` to `MetricDef`.
- Change `formatIntervalLabel(start: number, end: number, unit = "m")` to `` `${start}-${end}${unit}` ``.
- In `parseCumulative`, `const unit = metric.interval_unit === "yd" ? "yd" : "m"` and pass `unit` into every `formatIntervalLabel` call.
- Leave the `${startM}-${endM}m_Split` velocity lookup as-is (no yd split metrics in registry → no extra mph rows).

Wire `getPrimaryComponent` / canonical helper from Task 3 if not already.

**Step 4: Run tests**

Run: `npm test -- src/lib/parser.test.ts src/lib/metric-utils.test.ts -v`

Expected: PASS (including `40m_Sprint` still `0-40m`)

**Step 5: Commit**

```bash
git add src/lib/metrics.json src/lib/parser.ts src/lib/parser.test.ts src/lib/metric-utils.ts src/lib/metric-utils.test.ts src/lib/canonical-cumulative.ts
git commit -m "feat(metrics): add 40yd_Dash with yard split labels"
```

---

### Task 5: Football Hugo group

**Files:**
- Modify: `src/lib/weight-room/constants.ts`
- Modify: `src/lib/weight-room/constants.test.ts`

**Step 1: Write the failing test**

In `constants.test.ts`:

- `isHugoGroup("football")` is true
- `HUGO_GROUP_META.football` is `{ label: "Football", season: "fall" }`
- `FALL_IN_SEASON_GROUPS` includes `"football"` (after soccer/volleyball/xc, before or after extra — put after `xc`: soccer, volleyball, xc, football, extracurricular)
- `printHeaderGroups("soccer")` includes `"football"`
- `printHeaderGroups("football")` equals fall list (not winter)

**Step 2: Run to fail**

Run: `npm test -- src/lib/weight-room/constants.test.ts -v`

**Step 3: Implement**

Add `"football"` to `HUGO_GROUPS` (fall block), `HUGO_GROUP_META`, and `FALL_IN_SEASON_GROUPS`.

**Step 4: Run full weight-room constant tests plus `hugo-memberships` / `layout` tests if they snapshot group lists.**

Run: `npm test -- src/lib/weight-room/constants.test.ts -v`

**Step 5: Commit**

```bash
git add src/lib/weight-room/constants.ts src/lib/weight-room/constants.test.ts
git commit -m "feat(weight-room): add football as a fall Hugo group"
```

---

### Task 6: SQL migration

**Files:**
- Create: `scripts/migrate-normative-data.sql`

No Vitest. Follow `scripts/migrate-athlete-hugo-memberships.sql` style (safe to re-run).

Include:

1. Drop/recreate `athletes_hugo_group_check` and `athlete_hugo_memberships_group_check` to add `'football'`. If `workout_templates` / `session_logs` have CHECKs, update those too; grep `hugo_group IN`.
2. `ALTER TABLE athlete_hugo_memberships ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;`
3. Unique index `athlete_hugo_memberships_one_primary` on `(athlete_id) WHERE is_primary`.
4. `sessions.origin TEXT` + CHECK `origin IS NULL OR origin = 'weight_room'`.
5. `entries.source TEXT` + CHECK `source IS NULL OR source = 'weight_room'`.
6. Unique index `entries_wr_upsert` on `(session_id, athlete_id, metric_key) WHERE source = 'weight_room'`.
7. `workout_movements.speed_journal_metric_key TEXT`.
8. `norm_populations`, `norm_thresholds`, `norm_sport_defaults` as in the design. Threshold unique on `(population_id, metric_key, gender, COALESCE(component, ''), label)`. Gender CHECK `IN ('M','F')`. Label CHECK against the six keys.
9. Seed **names only**: insert populations `HS Volleyball VJ` and `Football Skill 40yd` `ON CONFLICT (name) DO NOTHING`. Insert sport defaults volleyball/`Vertical Jump`, football/`40yd_Dash`, soccer/`40yd_Dash` using those ids, `ON CONFLICT DO NOTHING`. **No threshold numbers.**

**Step: Run against the project database** (coach machine / Vercel). Document in `scripts/README.md` one paragraph: run `scripts/migrate-normative-data.sql` like other SQL files.

**Commit:**

```bash
git add scripts/migrate-normative-data.sql scripts/README.md
git commit -m "feat(norms): add populations, thresholds, and football CHECK migration"
```

---

### Task 7: Journal-post checklist helpers

**Files:**
- Create: `src/lib/norms/journal-posts.ts`
- Test: `src/lib/norms/journal-posts.test.ts`

Detection is **not** name regex. Inputs: movements with optional `speed_journal_metric_key`, parsed cells (`kind`, `load`, `units`).

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  buildJournalPostCandidates,
  applyJournalPosts,
  type JournalMovement,
  type CellOutput,
} from "./journal-posts";

const cmj: JournalMovement = {
  id: "mov-cmj",
  name: "CMJ (Vertical Jump)",
  speed_journal_metric_key: "Vertical Jump",
};
const submax: JournalMovement = {
  id: "mov-sub",
  name: "CMJ (Vertical Jump) — Submax",
  speed_journal_metric_key: null,
};
const unmappedOut: JournalMovement = {
  id: "mov-bj",
  name: "Broad Jump",
  speed_journal_metric_key: null,
};

const outputs: CellOutput[] = [
  { movement_id: "mov-cmj", kind: "output", load: 20, units: "in" },
  { movement_id: "mov-cmj", kind: "output", load: 22.5, units: "in" },
  { movement_id: "mov-sub", kind: "output", load: 18, units: "in" },
  { movement_id: "mov-bj", kind: "output", load: 8, units: "ft" },
  { movement_id: "mov-cmj", kind: "load_reps", load: 185, units: "lb" },
];

describe("buildJournalPostCandidates", () => {
  it("pre-checks mapped best output only", () => {
    const rows = buildJournalPostCandidates({
      movements: [cmj, submax, unmappedOut],
      outputs,
      lowerIsBetterFor: () => false,
    });
    const mapped = rows.find((r) => r.movement_id === "mov-cmj");
    expect(mapped).toMatchObject({
      metric_key: "Vertical Jump",
      best_value: 22.5,
      units: "in",
      suggested_post: true,
      mapped: true,
    });
    const sub = rows.find((r) => r.movement_id === "mov-sub");
    expect(sub).toBeUndefined();
    const bj = rows.find((r) => r.movement_id === "mov-bj");
    expect(bj).toMatchObject({
      mapped: false,
      suggested_post: false,
      best_value: 8,
    });
  });

  it("omits mapped movement with no output", () => {
    const rows = buildJournalPostCandidates({
      movements: [cmj],
      outputs: [],
      lowerIsBetterFor: () => false,
    });
    expect(rows).toEqual([
      expect.objectContaining({
        movement_id: "mov-cmj",
        mapped: true,
        suggested_post: false,
        best_value: null,
      }),
    ]);
  });
});

describe("applyJournalPosts", () => {
  it("keeps only post true with a value", () => {
    const candidates = buildJournalPostCandidates({
      movements: [cmj, unmappedOut],
      outputs,
      lowerIsBetterFor: () => false,
    });
    const posted = applyJournalPosts(candidates, [
      { movement_id: "mov-cmj", metric_key: "Vertical Jump", post: true },
      { movement_id: "mov-bj", metric_key: "Standing-Broad", post: true },
    ]);
    expect(posted).toHaveLength(2);
    expect(posted.map((p) => p.metric_key).sort()).toEqual([
      "Standing-Broad",
      "Vertical Jump",
    ]);
  });

  it("skips post false even when mapped", () => {
    const candidates = buildJournalPostCandidates({
      movements: [cmj],
      outputs,
      lowerIsBetterFor: () => false,
    });
    expect(
      applyJournalPosts(candidates, [
        { movement_id: "mov-cmj", metric_key: "Vertical Jump", post: false },
      ])
    ).toEqual([]);
  });
});
```

**Step 3: Implement** `buildJournalPostCandidates` / `applyJournalPosts` in `src/lib/norms/journal-posts.ts`. Best of outputs: max `load` when `lowerIsBetterFor(metric) === false`, min when true. Ignore non-`output` kinds. Unmapped outputs still appear as candidates with `metric_key: null` and `suggested_post: false`. Mapped with no output: one disabled row (`best_value: null`).

`lowerIsBetterFor` is injected so tests don’t import the full registry; the confirm route passes `(key) => getMetricsRegistry()[key]?.display_units === "s"`.

**Step 5: Commit**

```bash
git add src/lib/norms/journal-posts.ts src/lib/norms/journal-posts.test.ts
git commit -m "feat(norms): detect card test outputs for journal checklist"
```

---

### Task 8: Movement mapping on templates

**Files:**
- Modify: `src/types/weight-room.ts` (`WorkoutMovement.speed_journal_metric_key`)
- Modify: `src/lib/weight-room/insert-template.ts` (`MovementInsertInput`, `parseMovements`, `serializeMovement`, INSERT/RETURNING)
- Modify: `src/lib/weight-room/insert-template.test.ts`
- Card editor UI that already edits movements: find the client that PATCHes templates (`src/app/weight-room/cards/`) and add an optional metric `<select>` (registry keys; empty = none). Validate key exists in `getMetricsRegistry()` inside `parseMovements` when non-empty.

**Tests:** parse template JSON with `speed_journal_metric_key: "Vertical Jump"`; reject `"not-a-metric"`.

**Commit:** `feat(weight-room): map template movements to Speed Journal metrics`

---

### Task 9: Confirm route dual-write + review checklist UI

**Files:**
- Modify: `src/app/api/weight-room/scans/[id]/confirm/route.ts`
- Modify: `src/app/weight-room/scans/[id]/ReviewClient.tsx`
- Create: `src/lib/norms/weight-room-journal.ts` (find-or-create session + upsert entry — keep SQL here or in the route; extract **pure** `parseJournalPostsBody`)

**Behavior:**

1. After `session_logs` / `set_results` succeed, parse `journal_posts` from JSON (default `[]`).
2. Rebuild candidates from template movements + confirm `results` (kind/load/units).
3. `applyJournalPosts`. For each: `parseEntry(metric_key, String(best_value))` — VJ is single_interval inches. Take the first parsed row.
4. Find session: `SELECT id FROM sessions WHERE session_date = $date AND origin = 'weight_room' LIMIT 1`. If missing, `INSERT` date, phase `Competition`, phase_week `1`, `day_metrics` including posted keys, `origin = 'weight_room'`.
5. `INSERT INTO entries (... source) VALUES (..., 'weight_room') ON CONFLICT ON CONSTRAINT` — use the unique **index** `entries_wr_upsert`; in Postgres that’s `ON CONFLICT (session_id, athlete_id, metric_key) WHERE source = 'weight_room'` — if the tagged template client cannot express partial unique, do `UPDATE` then `INSERT` in a helper.
6. Journal errors: catch per row, push to `journal_warnings`, do not rollback the lift.
7. Response includes `journal_warnings` and `journal_entry_ids`.

**ReviewClient:** after cells, a “Speed Journal tests” list. Seed from GET of candidates — compute client-side with `buildJournalPostCandidates` + `parseLoadReps` on edited cells (same helper as server). Checkboxes, metric select for unmapped. Send `journal_posts` with Confirm.

**Commit:** `feat(weight-room): confirm checklist before dual-write to entries`

---

### Task 10: Load thresholds + attach zones helper

**Files:**
- Create: `src/lib/norms/attach-zones.ts`
- Test: `src/lib/norms/attach-zones.test.ts`

Pure function: given rows `{ athlete_id, gender, display_value }`, memberships `{ athlete_id, hugo_group, is_primary }`, defaults `{ hugo_group, metric_key, population_id }`, thresholds `{ population_id, gender, component, label, threshold }`, `metricKey`, `component`, `lowerIsBetter`, optional `overridePopulationId`.

For each row: pick population (override or primary sport default). Filter cuts to gender + component (`null` matches NULL). `resolveZone`. Attach `zone_label`, `zone_color`, `population_name` (need a population id→name map).

Tests: mixed sports different zones; override paints everyone; no primary → no zone; empty gender table → no zone.

**Commit:** `feat(norms): attach zones to leaderboard rows from current tables`

---

### Task 11: Leaderboard API + live cards

**Files:**
- Modify: `src/types/index.ts` (`LeaderboardRow` optional `zone_label`, `zone_color`, `population_name`)
- Modify: `src/app/api/leaderboard/route.ts` — optional `population_id`; if present and not a UUID / not found → 400. Query memberships + defaults + thresholds; `try/catch` omit zones on SQL failure.
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` — pass `population_id` search param from a select (populations fetched `GET /api/norms/populations` **or** a public `GET /api/norms/populations?public=1` read-only list: id+name only, no auth, archived excluded). Prefer **public read** `GET /api/norms/populations` without PIN so the public board works. Do **not** expose cuts on that list endpoint if you want; cuts are loaded server-side on leaderboard anyway.
- Card: value `style={{ color: row.zone_color }}` when set; `border-l-4` accent; chip with `zone_label`. Legend under filters.
- Modify: `src/app/globals.css` — `--zone-poor` … `--zone-world-class` matching palette hex (light + `.dark` if needed).

`GET /api/norms/populations` (public, names only) in this task or Task 13 — if you add it here, Task 13 reuses it.

**Commit:** `feat(leaderboard): show current-stick zone badge and value color`

---

### Task 12: Historical leaderboard zones

**Files:**
- Modify: `src/app/api/leaderboard/historical/route.ts` — same attach-zones + optional `population_id`.
- Modify historical client if it renders the same cards; reuse chip styling (extract a tiny `ZoneMark` in `src/app/leaderboard/ZoneMark.tsx` if duplication is obvious).

**Commit:** `feat(historical): apply current-stick zones to historical board`

---

### Task 13: Reporting CSV + summary UI

**Files:**
- Modify: `src/app/api/reporting/export/route.ts` — append `zone_label`, `population_name`. Join memberships/defaults/thresholds in JS after fetch (batch, don’t N+1). Empty string when unbadged.
- Modify: `src/types/reporting.ts` if summary payloads gain zone fields on per-metric aggs — **YAGNI:** if summary doesn’t list raw marks, only CSV + testing-day. Check `ReportingClient.tsx`; if it only shows counts, skip UI chips here.
- If summary lists top marks, attach zones there too.

**Commit:** `feat(reporting): add zone columns to CSV export`

---

### Task 14: Testing-day summary

**Files:**
- Create: `src/lib/norms/testing-day.ts` + `src/lib/norms/testing-day.test.ts` (pure aggregation)
- Create: `src/app/api/reporting/testing-day/route.ts` — `requireCoachSession`, query session entries for metric/component, attach zones, group by primary sport + gender
- Create: `src/app/reporting/testing-day/page.tsx` + client: session picker, metric, optional component, optional population override, printable sections, Efficient+ = `zoneRank(label) >= zoneRank("efficient")` among hits (unbadged excluded from Efficient+)

Efficient+ count: athletes whose resolved label has `zoneRank >= efficient`. Missing efficient label on the table does not invent it; still count elite/advanced/world-class.

**Commit:** `feat(reporting): add testing-day summary by sport and gender`

---

### Task 15: Norms editor APIs

**Files:**
- Create: `src/app/api/norms/populations/route.ts` (GET public names; POST coach create)
- Create: `src/app/api/norms/populations/[id]/route.ts` (PATCH name/notes/archive; block archive if defaults point here)
- Create: `src/app/api/norms/thresholds/route.ts` (GET by population+metric+component; PUT replace filled cells for that slice — validate unique thresholds per gender, `isZoneLabel`, `M`/`F`)
- Create: `src/app/api/norms/defaults/route.ts` (GET all; PUT hugo_group+metric_key+population_id | null)

All writes: `requireCoachSession`. `{ data }` / `{ error }`.

**Commit:** `feat(norms): add coach APIs for populations, cuts, and sport defaults`

---

### Task 16: Norms editor UI

**Files:**
- Create: `src/app/norms/page.tsx` — `getServerSession`, redirect login
- Create: `src/app/norms/NormsEditor.tsx` — three panes per design
- Modify: `src/app/page.tsx` — Manage link “Norms”
- Modify: `src/app/weight-room/page.tsx` — link to `/norms`

Cuts grid: 6 rows × 2 genders; empty input deletes that cell on save. Component field when metric is `40yd_Dash` (select: empty / `0-10yd` / `0-20yd` / `0-40yd` / `10-20yd` / `20-40yd` / `0-5yd` / `5-10yd`).

**Commit:** `feat(norms): add coach editor for populations and cuts`

---

### Task 17: Primary Hugo sport on roster

**Files:**
- Modify: `src/lib/weight-room/hugo-memberships.ts` — select `is_primary`; include on attached athletes
- Modify: `src/app/api/weight-room/rosters/route.ts` (and commit/PATCH as needed) — setting primary: `UPDATE … SET is_primary = false WHERE athlete_id`; then `true` on that group. Adding first membership can set primary automatically.
- Modify: `src/app/athletes/HugoTeamsSection.tsx` — “Primary” control among checked teams
- Modify: `src/types/index.ts` if `hugo_primary` is needed on Athlete

**Commit:** `feat(athletes): set primary Hugo sport for default norms`

---

### Task 18: Verification

**Step 1:** `npm test`

Expected: all existing + new tests pass.

**Step 2:** `npm run build`

Expected: compile success.

**Step 3:** Manual (after migrate):

1. `/norms` — create cuts for volleyball VJ girls (efficient + elite only) and football 40yd boys full dash.
2. `/leaderboard` — session with VJ; volleyball girl 22" → Efficient color/chip; 18" → no badge.
3. Compare using Football Skill on a 40yd session; soccer kids pick up that table.
4. Historical same marks after editing cuts — colors follow the new stick.
5. CSV has zone columns.
6. Testing-day page groups by sport.
7. Card: map CMJ → Vertical Jump; review checklist; uncheck → no entry; check → WR session that date, leaderboard updates; same-day track session unchanged.
8. Roster: football + soccer, set primary; mixed board defaults correctly.

**Step 4: Commit** only if you made small fixes: `chore(norms): verification fixes`

---

Plan complete and saved to `docs/plans/2026-08-31-normative-data-implementation.md`.
