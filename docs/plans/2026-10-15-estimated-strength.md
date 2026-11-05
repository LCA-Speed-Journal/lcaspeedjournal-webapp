# Estimated Strength Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Estimate a 1RM from logged load, reps, and RPE, keep each strength pattern independent, and show the result on the athlete page, Team Progress, and a printable extracurricular working-weight table.

**Architecture:** Pure functions in `src/lib/strength/` turn a set into a percent of 1RM (Liberty chart) and scale it onto one pattern reference (Dietz ratios plus Hugo aliases). A log updates only that pattern. `set_results.rpe_override` stores a coach nudge. Baselines are a per-pattern snapshot, not a live link across patterns. Screens read one series API. The shared workout card is never rewritten.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates), Recharts (existing Team Progress chart), `requireCoachSession`.

**Design:** `docs/plans/2026-10-15-estimated-strength-design.md`

**Workspace:** Implement on the current checkout. Do not create a git worktree.

---

### Task 1: Relative-intensity percent

**Files:**
- Create: `src/lib/strength/relative-intensity.ts`
- Test: `src/lib/strength/relative-intensity.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { percentOf1Rm } from "./relative-intensity";

describe("percentOf1Rm", () => {
  it("matches the Liberty chart at the checked cells", () => {
    expect(percentOf1Rm(1, 10)).toBeCloseTo(1, 3);
    expect(percentOf1Rm(5, 8)).toBeCloseTo(0.788, 3);
    expect(percentOf1Rm(3, 7)).toBeCloseTo(0.786, 3);
  });

  it("interpolates reps 7 and 9", () => {
    expect(percentOf1Rm(7, 10)).toBeCloseTo(0.825, 3);
    expect(percentOf1Rm(9, 10)).toBeCloseTo(0.7625, 3);
  });

  it("returns null outside reps 1-10 or RPE 3-10", () => {
    expect(percentOf1Rm(0, 8)).toBeNull();
    expect(percentOf1Rm(11, 8)).toBeNull();
    expect(percentOf1Rm(5, 2.5)).toBeNull();
    expect(percentOf1Rm(5, 10.5)).toBeNull();
    expect(percentOf1Rm(5.5, 8)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/relative-intensity.test.ts`

Expected: FAIL with `percentOf1Rm` not defined.

**Step 3: Write minimal implementation**

```ts
/** Max-effort row of the Liberty chart. Reps 7 and 9 are midpoints. */
const MAX_EFFORT: Record<number, number> = {
  1: 1,
  2: 0.95,
  3: 0.925,
  4: 0.9,
  5: 0.875,
  6: 0.85,
  7: 0.825,
  8: 0.8,
  9: 0.7625,
  10: 0.725,
};

/** Fraction of 1RM for integer reps at an RPE on the chart. */
export function percentOf1Rm(reps: number, rpe: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  if (rpe < 3 || rpe > 10) return null;
  const intensity = 1 - 0.05 * (10 - rpe);
  return MAX_EFFORT[reps] * intensity;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/relative-intensity.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/relative-intensity.ts src/lib/strength/relative-intensity.test.ts
git commit -m "Estimate percent of 1RM from reps and RPE."
```

---

### Task 2: Prescribed RPE and the nudge

**Files:**
- Create: `src/lib/strength/rpe.ts`
- Test: `src/lib/strength/rpe.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applyRpeNudge, resolveSetRpe } from "./rpe";

describe("resolveSetRpe", () => {
  it("prefers the override over the card", () => {
    expect(resolveSetRpe({ target: "3 @ RPE 8", rpeOverride: 6.5 })).toEqual({
      rpe: 6.5,
      prescribedReps: 3,
      rmAttempt: false,
    });
  });

  it("reads reps and RPE from the target", () => {
    expect(resolveSetRpe({ target: "6/side @ RPE 7", rpeOverride: null })).toEqual({
      rpe: 7,
      prescribedReps: 6,
      rmAttempt: false,
    });
  });

  it("treats an RM attempt as RPE 10", () => {
    expect(resolveSetRpe({ target: "3RM Attempt", rpeOverride: null })).toEqual({
      rpe: 10,
      prescribedReps: 3,
      rmAttempt: true,
    });
  });

  it("returns null RPE when the target has no intensity", () => {
    expect(resolveSetRpe({ target: "Max Attempt", rpeOverride: null }).rpe).toBeNull();
  });
});

describe("applyRpeNudge", () => {
  it("steps by 0.5 and stops at ±1.5", () => {
    expect(applyRpeNudge(8, 0.5)).toBe(8.5);
    expect(applyRpeNudge(8, 1.5)).toBe(9.5);
    expect(applyRpeNudge(8, 2)).toBe(9.5);
    expect(applyRpeNudge(8, -1.5)).toBe(6.5);
  });

  it("clamps to the chart range", () => {
    expect(applyRpeNudge(10, 1.5)).toBe(10);
    expect(applyRpeNudge(3, -1.5)).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/rpe.test.ts`

Expected: FAIL with `resolveSetRpe` not defined.

**Step 3: Write minimal implementation**

```ts
const TARGET_RPE = /(\d+)\s*(?:\/\s*side)?\s*@\s*RPE\s*(\d+(?:\.\d+)?)/i;
const RM_ATTEMPT = /(\d+)\s*RM/i;

export function resolveSetRpe(input: {
  target: string | null;
  rpeOverride: number | null;
}): { rpe: number | null; prescribedReps: number | null; rmAttempt: boolean } {
  const target = input.target?.trim() ?? "";
  const rm = target.match(RM_ATTEMPT);
  const rmAttempt = rm != null && /attempt|test/i.test(target);
  const prescribed = target.match(TARGET_RPE);
  const prescribedReps = prescribed
    ? Number(prescribed[1])
    : rmAttempt && rm
      ? Number(rm[1])
      : null;
  const fromCard = prescribed ? Number(prescribed[2]) : rmAttempt ? 10 : null;
  const rpe = input.rpeOverride ?? fromCard;
  return { rpe, prescribedReps, rmAttempt };
}

/** Effective RPE. Delta is snapped to 0.5 and limited to ±1.5, then clamped to 3–10. */
export function applyRpeNudge(prescribed: number, delta: number): number {
  const snapped = Math.round(delta * 2) / 2;
  const limited = Math.max(-1.5, Math.min(1.5, snapped));
  const next = prescribed + limited;
  return Math.max(3, Math.min(10, next));
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/rpe.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/rpe.ts src/lib/strength/rpe.test.ts
git commit -m "Resolve prescribed RPE and clamp a coach nudge."
```

---

### Task 3: Exercise ratios and pattern lookup

**Files:**
- Create: `src/lib/strength/exercises.ts`
- Test: `src/lib/strength/exercises.test.ts`

Patterns: `squat | hinge | single_leg | press | pull | power`.

Each exercise has `parent: "squat" | "bench" | "clean"`, `ratio` (Max Sheet multiplier on that parent), and `pattern`. Goblet squat is not on the sheet: ratio `0.64` of squat (`0.80 × 0.80`).

Reference exercise per pattern (same parent as the variations that may update it):

| Pattern | Reference name | Parent | Ratio |
|---------|----------------|--------|-------|
| squat | Back Squat | squat | 1 |
| hinge | Hex Deadlift | squat | 1.15 |
| single_leg | DB Split Squat | squat | 0.5 |
| press | Bench Press | bench | 1 |
| pull | Lat Pull Down | bench | 0.75 |
| power | Power Clean | clean | 1 |

Include these rows (ratio is the sheet value). Aliases are extra card names that resolve to the same row.

- Squat: Back Squat 1; Front Squat 0.8; Goblet Squat 0.64; Rack squat 1.2; Safety Squat 1.33; Sport Back Squat 1; Leg Press 1.5
- Hinge: Hex Deadlift 1.15 (aliases Trap-Bar Deadlift, Trap Bar Deadlift); Deadlift 1.2; Straight Leg DL 0.65; RDL 0.75 (aliases BB RDL, Romanian Deadlift); RDL Shrug 0.75; DB RDL 0.33; DB RDL Shrug 0.33; DB RDL InLine 0.33
- Single-leg: DB Split Squat 0.5 (aliases Split Squat, Split-Squat); Lunge 0.4 (aliases Forward-to-Reverse Lunge, DB Reverse Lunge, Reverse Lunge, Walking Lunge, DB Walking Lunge); Step up 0.5; Front Step Up 0.4; DB Step up 0.3 (alias DB Step-Up); SL Squat 0.45
- Press: Bench Press 1 (aliases BB Bench, Bench); Incline Bench 0.8; DB Bench 0.35; DB Incline Bench 0.3; DB Shoulder Press 0.25 (alias Seated DB Shoulder Press); Arnold Press 0.2; Close Grip Bench 0.8; Dips 0.8; JM Press 0.6; JM DB Press 0.3
- Pull: Lat Pull Down 0.75 (aliases Pulldown, Pull-Up/Pulldown); BB BO Row 0.65; DB BO Row 0.35 (alias 1-Arm DB Row); DB Prone Row 0.35; Pull Up 0.6; Chin Up 0.6; Lat Pull Supine 0.55; Lat Pull Chin Grip 0.75; Squat Lat Row 0.55; SA Lat Pull Down 0.35
- Power: Power Clean 1; Clean 0.9; Clean & Jerk 0.7; Jerk 0.7; Push Press 0.65; Snatch 0.7; Power Snatch 0.7; Hang Snatch 0.7; DB Hang Clean 0.5; DB Push Press 0.35 (alias DB Push-Press); DB Jerk 0.35; DB Hang Snatch 0.25; DB Clean & Jerk 0.4; Clean Pulls 1.25; SA Snatch 0.25

Do not give curls, flys, lateral raises, or timed accessories a pattern. `lookupExercise` returns null for those names.

Match by normalizing case, hyphens, and a trailing parenthetical such as `(3RM Test)` or `(Back-Offs)`.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { lookupExercise, patternReference } from "./exercises";

describe("lookupExercise", () => {
  it("strips a test suffix and maps Hugo names", () => {
    expect(lookupExercise("DB Bench (3RM Test)")?.pattern).toBe("press");
    expect(lookupExercise("Goblet Squat (5RM Test)")?.ratio).toBeCloseTo(0.64, 5);
    expect(lookupExercise("Trap-Bar Deadlift")?.name).toBe("Hex Deadlift");
    expect(lookupExercise("BB RDL (Back-Offs)")?.pattern).toBe("hinge");
    expect(lookupExercise("Nordic / Slider Leg Curl")).toBeNull();
  });
});

describe("patternReference", () => {
  it("uses split squat for single-leg and hex deadlift for hinge", () => {
    expect(patternReference("single_leg").name).toBe("DB Split Squat");
    expect(patternReference("hinge").ratio).toBeCloseTo(1.15, 5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/exercises.test.ts`

Expected: FAIL with `lookupExercise` not defined.

**Step 3: Write minimal implementation**

Export `StrengthPattern`, `ExerciseRatio`, `EXERCISES`, `lookupExercise`, and `patternReference`. Normalize with:

```ts
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
```

Build a map from each canonical name and alias through `normalizeName`. `patternReference` looks up the six reference names in `EXERCISES`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/exercises.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/exercises.ts src/lib/strength/exercises.test.ts
git commit -m "Map card exercise names onto one strength pattern."
```

---

### Task 4: One-set estimate and within-pattern scale

**Files:**
- Create: `src/lib/strength/estimate.ts`
- Test: `src/lib/strength/estimate.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { estimateSet, roundTo5Lb, suggestedLoad, toPatternReference } from "./estimate";

describe("estimateSet", () => {
  it("uses logged reps with the card RPE", () => {
    const est = estimateSet({
      movementName: "Trap-Bar Deadlift",
      load: 185,
      reps: 3,
      target: "3 @ RPE 8",
      rpeOverride: null,
    });
    expect(est?.rpe).toBe(8);
    expect(est?.exerciseE1rm).toBeCloseTo(185 / (0.925 * 0.9), 1);
  });

  it("skips a prescription with no load", () => {
    expect(
      estimateSet({
        movementName: "Trap-Bar Deadlift",
        load: null,
        reps: null,
        target: "3 @ RPE 8",
        rpeOverride: null,
      })
    ).toBeNull();
  });
});

describe("toPatternReference", () => {
  it("turns 100 lb goblet into about 125 lb front squat and 156 lb back squat", () => {
    const ref = toPatternReference("Goblet Squat", 100);
    expect(ref?.pattern).toBe("squat");
    expect(ref!.referenceE1rm * 0.8).toBeCloseTo(125, 1);
    expect(ref!.referenceE1rm).toBeCloseTo(100 / 0.64, 1);
  });

  it("puts a lunge on the split-squat line", () => {
    const ref = toPatternReference("DB Reverse Lunge", 80);
    expect(ref?.pattern).toBe("single_leg");
    expect(ref!.referenceE1rm).toBeCloseTo(80 / 0.8, 1);
    expect(ref!.referenceName).toBe("DB Split Squat");
  });
});

describe("suggestedLoad", () => {
  it("suggests about 55 lb per dumbbell from a 200 bench", () => {
    expect(suggestedLoad({ pattern: "press", referenceE1rm: 200, movementName: "DB Bench", reps: 6, rpe: 8 })).toBe(55);
  });

  it("does not let a press max write the pull load", () => {
    const pull = suggestedLoad({
      pattern: "pull",
      referenceE1rm: 150,
      movementName: "Lat Pull Down",
      reps: 6,
      rpe: 8,
    });
    expect(pull).toBe(roundTo5Lb(150 * 0.765));
    expect(pull).not.toBe(roundTo5Lb(200 * 0.75 * 0.765));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/estimate.test.ts`

Expected: FAIL with `estimateSet` not defined.

**Step 3: Write minimal implementation**

```ts
export function roundTo5Lb(lb: number): number {
  return Math.round(lb / 5) * 5;
}

export function estimateSet(input: {
  movementName: string;
  load: number | null;
  reps: number | null;
  target: string | null;
  rpeOverride: number | null;
}): { rpe: number; exerciseE1rm: number } | null {
  if (input.load == null || input.load <= 0) return null;
  if (input.reps == null || !Number.isInteger(input.reps)) return null;
  const resolved = resolveSetRpe({ target: input.target, rpeOverride: input.rpeOverride });
  if (resolved.rpe == null) return null;
  const pct = percentOf1Rm(input.reps, resolved.rpe);
  if (pct == null || pct <= 0) return null;
  return { rpe: resolved.rpe, exerciseE1rm: input.load / pct };
}

export function toPatternReference(
  movementName: string,
  exerciseE1rm: number
): { pattern: StrengthPattern; referenceName: string; referenceE1rm: number } | null {
  const exercise = lookupExercise(movementName);
  if (!exercise) return null;
  const reference = patternReference(exercise.pattern);
  if (exercise.parent !== reference.parent) return null;
  return {
    pattern: exercise.pattern,
    referenceName: reference.name,
    referenceE1rm: exerciseE1rm * (reference.ratio / exercise.ratio),
  };
}

export function suggestedLoad(input: {
  pattern: StrengthPattern;
  referenceE1rm: number;
  movementName: string;
  reps: number;
  rpe: number;
}): number | null {
  const exercise = lookupExercise(input.movementName);
  if (!exercise || exercise.pattern !== input.pattern) return null;
  const reference = patternReference(input.pattern);
  if (exercise.parent !== reference.parent) return null;
  const pct = percentOf1Rm(input.reps, input.rpe);
  if (pct == null) return null;
  const exerciseMax = input.referenceE1rm * (exercise.ratio / reference.ratio);
  return roundTo5Lb(exerciseMax * pct);
}
```

`suggestedLoad` must be called with the reference of the movement's own pattern. The pull test passes 150 because the caller, not this function, refuses to reuse the press number.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/estimate.test.ts`

Expected: PASS. If 185 / (0.925 * 0.9) is slightly off a rounded expect, keep `toBeCloseTo` with 1 decimal. The 55 lb case is `roundTo5Lb(200 * 0.35 * 0.85 * 0.9)` = `roundTo5Lb(53.55)` = 55.

**Step 5: Commit**

```bash
git add src/lib/strength/estimate.ts src/lib/strength/estimate.test.ts
git commit -m "Convert a logged set into one pattern's estimated max."
```

---

### Task 5: Daily top set, series, and baseline seeds

**Files:**
- Create: `src/lib/strength/series.ts`
- Test: `src/lib/strength/series.test.ts`

A day keeps the set with the highest `referenceE1rm` per athlete per pattern. Later days do not copy that number into another pattern.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildPatternSeries, seedPatternsFromAnchors } from "./series";

const pressDay = {
  athleteId: "a",
  date: "2026-10-01",
  movementName: "DB Shoulder Press",
  load: 50,
  reps: 5,
  target: "5 @ RPE 8",
  rpeOverride: null,
};
const pullDay = {
  athleteId: "a",
  date: "2026-10-03",
  movementName: "Lat Pull Down",
  load: 100,
  reps: 8,
  target: "8 @ RPE 7",
  rpeOverride: null,
};

describe("buildPatternSeries", () => {
  it("updates press and leaves pull empty when only a press set exists", () => {
    const series = buildPatternSeries([pressDay]);
    expect(series.find((p) => p.pattern === "press")?.points).toHaveLength(1);
    expect(series.find((p) => p.pattern === "pull")?.points).toHaveLength(0);
  });

  it("keeps the heavier estimated set when two land the same day", () => {
    const series = buildPatternSeries([
      pressDay,
      { ...pressDay, load: 40, movementName: "DB Bench" },
    ]);
    const press = series.find((p) => p.pattern === "press")!;
    expect(press.points).toHaveLength(1);
    expect(press.points[0].sourceMovement).toBe("DB Shoulder Press");
  });
});

describe("seedPatternsFromAnchors", () => {
  it("snapshots hinge, single-leg, and pull once", () => {
    expect(seedPatternsFromAnchors({ squat: 300, bench: 200, power: 100 })).toEqual({
      squat: 300,
      press: 200,
      power: 100,
      hinge: 345,
      single_leg: 150,
      pull: 150,
    });
  });
});
```

Confirm the winning shoulder-press reference is higher than the 40 lb DB bench before locking the assertion. DB bench 40 at 5 @ RPE 8 is `40 / 0.7875 / 0.35` back-squat-equivalent wait, press reference: exercise e1RM × (1 / 0.35). Shoulder press ratio is 0.25, so 50 lb converts to a higher bench than 40 lb at 0.35. If the test fails because DB bench wins, swap the expected movement to whichever `toPatternReference` ranks higher and add a one-line comment with the two reference values. Do not change the rule.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/series.test.ts`

Expected: FAIL with `buildPatternSeries` not defined.

**Step 3: Write minimal implementation**

`LoggedStrengthSet` fields: `athleteId`, `date`, `movementName`, `load`, `reps`, `target`, `rpeOverride`.

`buildPatternSeries(sets)` groups by `athleteId + pattern + date`, keeps the max `referenceE1rm`, and returns one entry per pattern that appears, with points sorted by date. Each point includes `date`, `referenceE1rm`, `sourceMovement`, `load`, `reps`, `rpe`.

```ts
export function seedPatternsFromAnchors(anchors: {
  squat: number;
  bench: number;
  power: number;
}): Record<StrengthPattern, number> {
  return {
    squat: anchors.squat,
    press: anchors.bench,
    power: anchors.power,
    hinge: anchors.squat * 1.15,
    single_leg: anchors.squat * 0.5,
    pull: anchors.bench * 0.75,
  };
}
```

Also export `latestReferenceBefore(points, date)` which returns the last point with `point.date < date`, or null. Working weights use this so same-day work is excluded.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/series.test.ts src/lib/strength/estimate.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/series.ts src/lib/strength/series.test.ts
git commit -m "Keep each pattern's daily top set on its own line."
```

---

### Task 6: Database columns

**Files:**
- Create: `scripts/migrate-estimated-strength.sql`

**Step 1: Write the migration**

```sql
-- Coach-adjusted RPE for one logged set. NULL means "use the card target".
ALTER TABLE set_results
  ADD COLUMN IF NOT EXISTS rpe_override NUMERIC;

-- One current baseline per athlete per pattern.
-- origin 'anchor' is a coach-entered squat, bench, or power clean.
-- origin 'seed' is the one-time snapshot for hinge, single-leg, or pull.
-- origin 'edit' is a coach override of any pattern.
CREATE TABLE IF NOT EXISTS athlete_strength_baselines (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  value_lb NUMERIC NOT NULL,
  origin TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, pattern)
);
```

No SQL CHECK on `pattern` or `origin`. The app allows only `squat`, `hinge`, `single_leg`, `press`, `pull`, `power` and origins `anchor`, `seed`, `edit`.

**Step 2: Apply it locally**

Run: `psql "$POSTGRES_URL" -f scripts/migrate-estimated-strength.sql`

If `POSTGRES_URL` is not in the shell, use the same method as `scripts/README.md` (Vercel Postgres query editor or local `psql`). Expected: command completes, and a second run does not error.

**Step 3: Commit**

```bash
git add scripts/migrate-estimated-strength.sql
git commit -m "Add RPE overrides and per-pattern strength baselines."
```

---

### Task 7: Persist the RPE override

**Files:**
- Modify: `src/lib/weight-room/confirm-scan.ts` (`ConfirmResultPayload` and `buildConfirmPayload`)
- Modify: `src/lib/weight-room/manual-log.ts` (`ManualLogAthleteInput`, the payload passed to `buildConfirmPayload`)
- Modify: the `INSERT INTO set_results` that writes a confirm payload (search `set_results` in `src/app/api/weight-room/manual-log/route.ts` and `src/app/api/weight-room/scans/[id]/confirm/route.ts`)
- Test: `src/lib/weight-room/confirm-scan.test.ts` (add a case; do not rewrite existing cases)

**Step 1: Write the failing test**

Add to `confirm-scan.test.ts`:

```ts
it("copies an RPE override onto the matching set", () => {
  const result = buildConfirmPayload({
    scan: { athlete_id: "athlete-1", template_id: "template-1", extraction: { cells: {} } },
    template: {
      id: "template-1",
      session_date: "2026-10-01",
      hugo_group: "soccer",
      movements: [{ id: "move-1", set_count: 1 }],
    },
    editedCells: { "move-1:0": "185x3" },
    rpeOverrides: { "move-1:0": 6.5 },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.results[0].rpe_override).toBe(6.5);
});
```

Use the existing fixture's athlete, template, and hugo group if those strings differ. Read the current test file first and match it.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/weight-room/confirm-scan.test.ts`

Expected: FAIL because `rpe_override` is undefined.

**Step 3: Write minimal implementation**

Add optional `rpeOverrides?: Record<string, number | null>` to `ConfirmScanInput`. Add `rpe_override: number | null` on `ConfirmResultPayload`. For each cell, copy a finite number from `rpeOverrides[key]`, otherwise null.

`ManualLogAthleteInput` gains `rpe_overrides?: Record<string, number | null>`. Pass it through to `buildConfirmPayload`.

Both inserts write `rpe_override`. A resave replaces set results, so the client must send the current overrides again. Scan confirm sends no overrides, which stores null.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/weight-room/confirm-scan.test.ts src/lib/weight-room/manual-log.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/weight-room/confirm-scan.ts src/lib/weight-room/confirm-scan.test.ts src/lib/weight-room/manual-log.ts src/app/api/weight-room/manual-log/route.ts src/app/api/weight-room/scans/[id]/confirm/route.ts
git commit -m "Store a coach RPE override on the logged set."
```

---

### Task 8: Read API for pattern series

**Files:**
- Create: `src/lib/strength/load-sets.ts`
- Create: `src/app/api/strength/series/route.ts`
- Test: `src/app/api/strength/series/route.test.ts`

`GET /api/strength/series?athlete_id=` returns one athlete.

`GET /api/strength/series?hugo_group=&from=&to=` returns every roster member in range, plus a `median` series. Use `median` from `src/lib/team-progress/stats.ts`. A date's median uses athletes who have a point on that date. Carry the last point forward only inside one athlete's own line before taking the median, so a missing week does not drop them from the group line. Do not carry a value across patterns.

`load-sets.ts` selects `set_results` joined to `session_logs`, `workout_movements` (`name`, `targets`), filtered to `kind = 'load_reps'`. `targets` is a JSON array; the target for a set is `targets[set_index]`, or null. Map rows into `LoggedStrengthSet` and call `buildPatternSeries`.

Coach auth via `requireCoachSession`, same shape as `src/app/api/weight-room/overview/route.ts`. Invalid `hugo_group` or a request with neither `athlete_id` nor `hugo_group` returns 400.

**Step 1: Write the failing test**

Mirror `src/app/api/reporting/team-progress/route.test.ts`: mock `@/lib/require-coach` and `@/lib/strength/load-sets`.

```ts
it("returns 401 when unauthenticated", async () => {
  requireCoachSession.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
  const res = await GET(req("http://localhost:3000/api/strength/series?athlete_id=abc"));
  expect(res.status).toBe(401);
});

it("returns 400 when no athlete or group is given", async () => {
  const res = await GET(req("http://localhost:3000/api/strength/series"));
  expect(res.status).toBe(400);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/strength/series/route.test.ts`

Expected: FAIL because the route module does not exist.

**Step 3: Write minimal implementation**

Response body:

```ts
{
  data: {
    athletes: Array<{
      athlete_id: string;
      patterns: Array<{
        pattern: StrengthPattern;
        reference_name: string;
        points: Array<{
          date: string;
          reference_e1rm: number;
          source_movement: string;
          load: number;
          reps: number;
          rpe: number;
        }>;
      }>;
    }>;
    median?: Array<{ pattern: StrengthPattern; points: Array<{ date: string; reference_e1rm: number }> }>;
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/strength/series/route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/load-sets.ts src/app/api/strength/series/route.ts src/app/api/strength/series/route.test.ts
git commit -m "Read estimated strength series for an athlete or a roster."
```

---

### Task 9: Athlete page section

**Files:**
- Create: `src/app/athletes/EstimatedStrengthSection.tsx`
- Modify: `src/app/athletes/AthleteDashboard.tsx` (render the section after `AttendanceSection`)

Client section. `useSWR` or `fetch` `GET /api/strength/series?athlete_id=`. Render six lines only when a pattern has points. Reuse `TeamProgressLineChart` if its props accept `{ date, value }[]`; otherwise a small Recharts line chart in this file, loaded with `next/dynamic` and `ssr: false` like Team Progress.

For each pattern show the reference name, the latest pounds rounded to the whole number, and the change from the first point. Under the chart, one line for the latest source: date, movement, load, reps, RPE. A goblet source must show the movement name Goblet Squat, not Back Squat.

Empty state: "No estimated maxes yet." Load error: the response `error` string.

**Step 1: Implement the section and mount it**

No component test harness in this repo. The math is already tested.

**Step 2: Check the type**

Run: `npx tsc --noEmit --pretty false`

Expected: no new errors in these two files.

**Step 3: Commit**

```bash
git add src/app/athletes/EstimatedStrengthSection.tsx src/app/athletes/AthleteDashboard.tsx
git commit -m "Show estimated strength patterns on the athlete page."
```

---

### Task 10: Team Progress block

**Files:**
- Modify: `src/app/reporting/team-progress/TeamProgressClient.tsx`
- Create: `src/app/reporting/team-progress/EstimatedStrengthBlock.tsx`

The block uses the page's existing `hugo_group`, `from`, and `to`. Fetch `/api/strength/series?hugo_group=&from=&to=`. Default chart is `data.median`. A select lists roster athletes and switches to that athlete's `patterns`. Caption the group view "Median".

Do not fold these numbers into the existing best-load lift chart. That chart is raw load. This block is estimated 1RM.

**Step 1: Implement the block under the existing lift charts**

**Step 2: Check the type**

Run: `npx tsc --noEmit --pretty false`

Expected: no new errors in the team-progress files.

**Step 3: Commit**

```bash
git add src/app/reporting/team-progress/EstimatedStrengthBlock.tsx src/app/reporting/team-progress/TeamProgressClient.tsx
git commit -m "Add estimated strength to Team Progress."
```

---

### Task 11: Manual-log RPE nudge

**Files:**
- Modify: `src/app/weight-room/log/ManualLogClient.tsx`
- Modify: `src/lib/weight-room/manual-log.ts` if the save body type lives there

Next to each athlete cell whose preview kind is `load_reps`, show the effective RPE. The prescription comes from that movement's `targets[setIndex]` via `resolveSetRpe`. Buttons subtract or add 0.5, disabled at ±1.5 from the prescription or at RPE 3 and 10. Display the effective RPE. Store it in component state keyed by `movementId:setIndex` per athlete.

On save, send `rpe_overrides` only for cells that differ from the prescription. Send `null` is unnecessary; omitting the key stores null. When reloading a log, if `set_results.rpe_override` is present, show that value. The manual-log GET must return `rpe_override`. Add it to the select that already loads set results for the grid.

**Step 1: Implement the control and include it in the POST body**

**Step 2: Check the type**

Run: `npx tsc --noEmit --pretty false`

Expected: no new errors in the manual log files.

**Step 3: Commit**

```bash
git add src/app/weight-room/log/ManualLogClient.tsx src/lib/weight-room/manual-log.ts src/app/api/weight-room/manual-log/route.ts
git commit -m "Let a coach nudge RPE by up to 1.5 on the manual log."
```

---

### Task 12: Baseline API

**Files:**
- Create: `src/lib/strength/baselines.ts`
- Test: `src/lib/strength/baselines.test.ts`
- Create: `src/app/api/strength/baselines/route.ts`
- Test: `src/app/api/strength/baselines/route.test.ts`

`saveAnchors({ squat, bench, power })` returns the six values from `seedPatternsFromAnchors`. It does not decide the database write. The route does:

- `PUT` body `{ athlete_id, squat, bench, power }` writes squat, press, and power with origin `anchor`.
- For hinge, single_leg, and pull: insert the seed only when that row does not exist (`INSERT ... ON CONFLICT DO NOTHING`). An existing seed or edit is left alone, including when the coach later changes the squat or bench anchor.
- `PATCH` body `{ athlete_id, pattern, value_lb }` sets origin `edit` for that one pattern.
- `GET ?athlete_id=` or `?hugo_group=` returns rows. Coach auth. Reject an unknown pattern with 400.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { baselinesToWrite } from "./baselines";

describe("baselinesToWrite", () => {
  it("always writes the three anchors and only fills missing seeds", () => {
    const writes = baselinesToWrite({
      anchors: { squat: 300, bench: 200, power: 100 },
      existingPatterns: ["hinge"],
    });
    expect(writes.map((w) => w.pattern).sort()).toEqual(["power", "press", "pull", "single_leg", "squat"]);
    expect(writes.find((w) => w.pattern === "pull")).toMatchObject({ valueLb: 150, origin: "seed" });
    expect(writes.find((w) => w.pattern === "squat")?.origin).toBe("anchor");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/baselines.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

`baselinesToWrite` is pure. The route loads existing pattern keys, calls it, then upserts anchors and inserts missing seeds. Route test mocks `requireCoachSession` and the db helper. 401 and 400 cases match Task 8.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/baselines.test.ts src/app/api/strength/baselines/route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/baselines.ts src/lib/strength/baselines.test.ts src/app/api/strength/baselines/route.ts src/app/api/strength/baselines/route.test.ts
git commit -m "Save pattern baselines without relinking them later."
```

---

### Task 13: Working-weight table

**Files:**
- Create: `src/lib/strength/working-weights.ts`
- Test: `src/lib/strength/working-weights.test.ts`

Input: one template's movements (`name`, `targets`, `set_count`), plus per athlete `{ patterns: points, baselines: Record<pattern, number> }`. For each movement with a parsed target RPE or an RM attempt, emit one row. Use the first target that has an RPE, or the RM-attempt target. Value per athlete:

1. `latestReferenceBefore(points, sessionDate)` for that movement's pattern.
2. Else the baseline for that pattern.
3. Else null.
4. RM attempt: `roundTo5Lb(exerciseMax * percentOf1Rm(rmReps, 10))` and `kind: "ceiling"`.
5. Otherwise `suggestedLoad(...)` and `kind: "load"`.

A squat point must not fill a hinge cell. Cover that with a test: athlete has only a squat series point, movement is `BB RDL` with target `3 @ RPE 8`, baseline has no hinge. Cell is null.

**Step 1: Write the failing test**

Include the press/pull case from Task 4 at the table level: a press point of 200 and a pull baseline of 150 produce a DB bench cell of 55 and a lat-pulldown cell from 150, on session date after the press point.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/strength/working-weights.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/strength/working-weights.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/strength/working-weights.ts src/lib/strength/working-weights.test.ts
git commit -m "Build per-athlete working weights from that pattern only."
```

---

### Task 14: Extracurricular dashboard

**Files:**
- Create: `src/app/weight-room/extracurricular/page.tsx`
- Create: `src/app/weight-room/extracurricular/ExtracurricularClient.tsx`
- Create: `src/app/weight-room/extracurricular/print.css`
- Modify: `src/app/weight-room/page.tsx` (add a link, same classes as the Reports link)
- Create: `src/app/api/strength/working-weights/route.ts`

Page redirects to login when `getServerSession` is missing, `callbackUrl=/weight-room/extracurricular`. Same pattern as `src/app/weight-room/reports/page.tsx`.

Client:

- Template picker limited to `hugo_group=extracurricular` (existing templates API).
- Growth chart: same series endpoint with `hugo_group=extracurricular`. Toggle one athlete or the median.
- Baseline form: three number inputs (back squat, bench, power clean) per selected athlete, save via `PUT`. Show hinge, single-leg, and pull with their origin. Editing one of those uses `PATCH`.
- Table from `GET /api/strength/working-weights?template_id=`. Rows are movements. Columns are extracurricular roster athletes. Blank cell stays blank. Ceiling cells prefix `Test`.
- Print button calls `window.print()`. `print.css` hides the chart, picker, and baseline form.

The working-weights route loads the template, the extracurricular roster, series, and baselines, then calls `buildWorkingWeights`. Coach auth. 400 when `template_id` is missing. 404 when the template is not extracurricular.

**Step 1: Implement the route, page, and hub link**

**Step 2: Check the type**

Run: `npx tsc --noEmit --pretty false`

Expected: no new errors in these files.

**Step 3: Commit**

```bash
git add src/app/weight-room/extracurricular src/app/weight-room/page.tsx src/app/api/strength/working-weights/route.ts
git commit -m "Add the extracurricular strength dashboard and printable loads."
```

---

### Task 15: Verification

**Step 1: Run the strength tests**

Run: `npx vitest run src/lib/strength src/app/api/strength src/lib/weight-room/confirm-scan.test.ts`

Expected: PASS

**Step 2: Browser**

With `npm run dev` already running, sign in as a coach.

- Open an athlete who has in-season `load_reps` sets on an RPE target. The new section shows a pattern line and names the source movement.
- Open Team Progress for that athlete's Hugo group. The Estimated strength median renders. Choosing the athlete shows their line.
- Open `/weight-room/extracurricular`. Pick a week/day. Enter a back squat, bench, and power clean for one athlete, save, and confirm hinge, single-leg, and pull appear. Change the squat, save again, and confirm hinge does not move. Print preview shows athlete columns and 5 lb loads. An RM row says Test.
- On the manual log for a saved load, nudge RPE by 0.5 and by the ±1.5 stops. Reload and confirm the nudged RPE is still there.

**Step 3: Do not commit** unless a fix was required. If a fix was required, commit that fix on its own with a message that says what broke.
