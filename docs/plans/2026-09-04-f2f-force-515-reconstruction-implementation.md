# F2F Force 5–15 Reconstruction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconstruct a hypothetical Villani 5–15 fly time from 5–10 + 10–20 (constant acceleration 5–20), look it up on `time_s`, and store mph on the Force vertex.

**Architecture:** Pure helper `reconstructFiveFifteen` in `src/lib/norms/f2f/`. `resolveForce` looks up timed/reconstructed 5–15 on Villani **time**; 5–10-only and 0–20 stand-in stay on **mph**. `pickForce` in `profile.ts` runs the ladder. `pick-marks.ts` must put **both** 5–10 and 10–20 into Best/Latest `entries` or reconstruction never runs on the athlete page. React/PDF do not invent predicted 40s.

**Tech Stack:** TypeScript, Vitest, existing XPE JSON (`src/lib/norms/f2f/tables/fly-5-15.json`), `mphFromYardSplit` in `src/lib/norms/forty-yd.ts`.

**Worktree:** `feature/force-to-form` at `.worktrees/force-to-form` (already isolated). Do not create a second worktree.

**Design:** [2026-09-04-f2f-force-515-reconstruction-design.md](./2026-09-04-f2f-force-515-reconstruction-design.md)

**PowerShell:** do not use `&&`. Separate commands with `;`.

---

### Task 1: Reconstruct t(5–15) helper

**Files:**
- Create: `src/lib/norms/f2f/reconstruct-515.ts`
- Test: `src/lib/norms/f2f/reconstruct-515.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { mphFromYardSplit } from "../forty-yd";
import { reconstructFiveFifteen } from "./reconstruct-515";

describe("reconstructFiveFifteen", () => {
  it("returns a 5-15 time slower than half of 10-20 when still accelerating", () => {
    const hit = reconstructFiveFifteen(0.7, 1.3);
    expect(hit).not.toBeNull();
    const half = 0.7 + 1.3 / 2;
    expect(hit!.timeS).toBeGreaterThan(half);
    expect(hit!.timeS).toBeLessThan(0.7 + 1.3);
    expect(hit!.timeS).toBeCloseTo(1.365, 3);
    expect(hit!.mph).toBeCloseTo(mphFromYardSplit(hit!.timeS, 10)!, 6);
  });

  it("is constant speed when 10-20 takes twice 5-10", () => {
    const hit = reconstructFiveFifteen(0.7, 1.4);
    expect(hit!.timeS).toBeCloseTo(1.4, 8);
  });

  it("returns null for non-positive times", () => {
    expect(reconstructFiveFifteen(0, 1.3)).toBeNull();
    expect(reconstructFiveFifteen(0.7, -1)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/f2f/reconstruct-515.test.ts`

Expected: FAIL (module not found).

**Step 3: Write minimal implementation**

Yards from the 5yd mark: \(x(t)=v t+\frac12 a t^2\).

\(t_1=t(5\text{–}10)\), \(T=t_1+t(10\text{–}20)\).

\[
a=\frac{10(2 t_1-t_2)}{t_1 t_2 T},\quad v=\frac{5}{t_1}-\frac12 a t_1
\]

If \(a=0\), \(t_*=10/v\). Else \(t_*=\frac{-v+\sqrt{v^2+20a}}{a}\) (positive root). Require \(v>0\) and \(t_1<t_*<T\). mph via `mphFromYardSplit(t_*, 10)`. Never throw.

```ts
import { mphFromYardSplit } from "../forty-yd";

export type ReconstructedFiveFifteen = { timeS: number; mph: number };

export function reconstructFiveFifteen(
  t5to10: number,
  t10to20: number
): ReconstructedFiveFifteen | null {
  if (!Number.isFinite(t5to10) || !Number.isFinite(t10to20)) return null;
  if (t5to10 <= 0 || t10to20 <= 0) return null;

  const t1 = t5to10;
  const t2 = t10to20;
  const T = t1 + t2;
  const a = (10 * (2 * t1 - t2)) / (t1 * t2 * T);
  const v = 5 / t1 - 0.5 * a * t1;
  if (!Number.isFinite(a) || !Number.isFinite(v) || v <= 0) return null;

  let timeS: number;
  if (Math.abs(a) < 1e-12) {
    timeS = 10 / v;
  } else {
    const disc = v * v + 20 * a;
    if (disc < 0) return null;
    timeS = (-v + Math.sqrt(disc)) / a;
  }
  if (!Number.isFinite(timeS) || timeS <= t1 || timeS >= T) return null;

  const mph = mphFromYardSplit(timeS, 10);
  if (mph == null) return null;
  return { timeS, mph };
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/f2f/reconstruct-515.test.ts`

Expected: PASS.

**Step 5: Commit**

```
git add src/lib/norms/f2f/reconstruct-515.ts src/lib/norms/f2f/reconstruct-515.test.ts
git commit -m "feat: reconstruct a 5-15 fly time from 5-10 and 10-20"
```

---

### Task 2: Villani Force lookup by time

**Files:**
- Modify: `src/lib/norms/f2f/tables.ts`
- Modify: `src/lib/norms/f2f/resolve-mark.ts`
- Modify: `src/lib/norms/f2f/resolve-mark.test.ts`

**Step 1: Write the failing test**

Add to `resolve-mark.test.ts`:

```ts
it("looks up a 5-15 fly on time_s, not 5-10 mph", () => {
  const byTime = resolveForce({ timeS: 1.25, yards: 10, lookup: "time" });
  const byMph = resolveForce({ timeS: 1.25, yards: 10, lookup: "mph" });
  expect(byTime?.predicted_40).toBeCloseTo(4.93, 2);
  expect(byMph?.predicted_40).toBeCloseTo(byTime!.predicted_40, 2);
});
```

Keep the existing 5-yard mph-bridge test on default/`mph` lookup.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/f2f/resolve-mark.test.ts`

Expected: FAIL on `lookup` / `forceTimePoints`.

**Step 3: Write minimal implementation**

In `tables.ts` add:

```ts
export function forceTimePoints(): LookupPoint[] {
  return (fly515.rows as FlyRow[]).map((row) => ({
    x: row.time_s,
    y: row.predicted_40,
  }));
}
```

In `resolve-mark.ts`, extend `ForceMark` with `lookup?: "time" | "mph"` (default `"mph"`). When `lookup === "time"`, require `timeS` and interpolate `forceTimePoints()` (ignore mph/yards for the key). Otherwise keep `markMph` + `forceMphPoints()`.

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/f2f/resolve-mark.test.ts`

Expected: PASS.

**Step 5: Commit**

```
git add src/lib/norms/f2f/tables.ts src/lib/norms/f2f/resolve-mark.ts src/lib/norms/f2f/resolve-mark.test.ts
git commit -m "feat: look up Villani Force flies on time"
```

---

### Task 3: pickForce ladder in the profile

**Files:**
- Modify: `src/lib/norms/f2f/types.ts` — optional `mph?: number` on `F2fVertex`
- Modify: `src/lib/norms/f2f/profile.ts`
- Modify: `src/lib/norms/f2f/profile.test.ts`

**Step 1: Write the failing tests**

Add to `profile.test.ts`:

```ts
it("reconstructs Force 5-15 from 5-10 and 10-20 instead of 5-10 mph", () => {
  const profile = buildF2fProfile(
    [
      { metric_key: "Standing-Broad", component: null, display_value: 9 },
      { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.7 },
      { metric_key: "40yd_Dash", component: "10-20yd", display_value: 1.3 },
      { metric_key: "40yd_Dash", component: "20-40yd", display_value: 2.045 },
      { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.0 },
    ],
    male
  );
  const mphOnly = resolveForce({ timeS: 0.7, yards: 5 });
  expect(profile.force?.projected).toBe(true);
  expect(profile.force?.input?.component).toBe("5-15yd");
  expect(profile.force?.input?.value).toBeCloseTo(1.365, 3);
  expect(profile.force?.mph).toBeCloseTo(mphFromYardSplit(1.365, 10)!, 2);
  expect(profile.force?.predicted_40).not.toBeCloseTo(mphOnly!.predicted_40, 2);
  expect(profile.form?.projected).toBe(false);
});

it("prefers a timed 5-15yd over reconstruction", () => {
  const profile = buildF2fProfile(
    [
      { metric_key: "40yd_Dash", component: "5-15yd", display_value: 1.2 },
      { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.7 },
      { metric_key: "40yd_Dash", component: "10-20yd", display_value: 1.3 },
    ],
    male
  );
  expect(profile.force?.projected).toBe(false);
  expect(profile.force?.input?.component).toBe("5-15yd");
  expect(profile.force?.input?.value).toBe(1.2);
});
```

Import `mphFromYardSplit`. Timed 5–15 predicted_40 must match `resolveForce({ timeS: 1.2, yards: 10, lookup: "time" })`.

**Update existing tests that include both 5–10 and 10–20** (court sprint-anchor in `profile.test.ts`): Force is no longer 5–10 mph. Keep asserting Explosion does not enter the reference median; recompute expected Force from reconstruction. Tests with 5–10 and **no** 10–20 (first fixture `0.625`, flags fixture `1.39`) stay on the mph bridge.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/norms/f2f/profile.test.ts`

Expected: FAIL (still uses 5–10 mph when 10–20 present).

**Step 3: Write minimal implementation**

`pickForce` order:

1. Best `5-15yd` → `resolveForce({ timeS, yards: 10, lookup: "time" })`, `projected: false`, set `mph` from `mphFromYardSplit(timeS, 10)`.
2. Else best `5-10yd` **and** best `10-20yd` → `reconstructFiveFifteen`; if non-null, `resolveForce({ timeS: hit.timeS, yards: 10, lookup: "time" })`, `projected: true`, `input`: `{ metric_key` from the 5–10 entry, `component: "5-15yd", value: hit.timeS, units: "s" }`, `mph: hit.mph`. `session_date` only if both entries share the same date.
3. Else best `5-10yd` → existing mph `resolveForce({ timeS, yards: 5 })`, `projected: false`, set `mph` from that 5-yard split.
4. Else 0–20 stand-in (unchanged), set `mph` from `mphFromYardSplit(time, 20)`.

Extend `vertexFromEntry` (or a sibling) to pass `mph`. Do not change Form.

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/f2f/profile.test.ts`

Expected: PASS.

**Step 5: Commit**

```
git add src/lib/norms/f2f/types.ts src/lib/norms/f2f/profile.ts src/lib/norms/f2f/profile.test.ts
git commit -m "feat: use reconstructed 5-15 for Force when 5-10 and 10-20 exist"
```

---

### Task 4: Best/Latest must pick 10–20 for reconstruction

**Files:**
- Modify: `src/lib/norms/f2f/pick-marks.ts`
- Modify: `src/lib/norms/f2f/pick-marks.test.ts`

**Why:** `pickForce` today returns one row. Best/Latest `compactPicked` then drops `10-20yd` when Form is `20-40yd`, so the athlete page never reconstructs.

**Step 1: Write the failing test**

```ts
it("includes 5-10 and 10-20 in best picks when there is no timed 5-15", () => {
  const fiveTen = dated({
    metric_key: "40yd_Dash",
    component: "5-10yd",
    display_value: 0.7,
    session_id: "apr",
    session_date: APR,
  });
  const tenTwenty = dated({
    metric_key: "40yd_Dash",
    component: "10-20yd",
    display_value: 1.3,
    session_id: "apr",
    session_date: APR,
  });
  const twentyForty = dated({
    metric_key: "40yd_Dash",
    component: "20-40yd",
    display_value: 2.0,
    session_id: "apr",
    session_date: APR,
  });
  const picked = pickF2fMarks([fiveTen, tenTwenty, twentyForty], {
    mode: "best",
    ...WINDOW,
  });
  expect(picked.entries.some((e) => e.component === "5-10yd")).toBe(true);
  expect(picked.entries.some((e) => e.component === "10-20yd")).toBe(true);
  expect(picked.entries.some((e) => e.component === "20-40yd")).toBe(true);
});
```

Add a **latest** analogue: later 5–10 + later 10–20 both included even when 20–40 is the Form mark.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/f2f/pick-marks.test.ts`

Expected: FAIL (10–20 absent).

**Step 3: Write minimal implementation**

Replace single `pickForce` with a bundle that returns 1–2 entries:

1. Timed `5-15yd` only
2. Else `5-10yd` + `10-20yd` when both exist (best time / latest per mode)
3. Else `5-10yd`
4. Else 0–20 stand-in

`compactPicked([...bundle, form, ...])` dedupes if Form also selected 10–20.

Do **not** add `10-20yd` to `isForceMark` (Latest Force would steal from 5–10). Keep 10–20 as a Form mark.

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/f2f/pick-marks.test.ts src/app/api/athletes/[id]/f2f/route.test.ts`

Expected: PASS.

**Step 5: Commit**

```
git add src/lib/norms/f2f/pick-marks.ts src/lib/norms/f2f/pick-marks.test.ts
git commit -m "feat: keep 10-20 with Force picks so 5-15 can be reconstructed"
```

---

### Task 5: Regression + design already on disk

**Files:**
- Verify: `docs/plans/2026-09-04-f2f-force-515-reconstruction-design.md` (already written)
- Modify only if tests fail: `src/lib/norms/f2f/board.test.ts`, `src/lib/norms/testing-day-pdf.test.ts`

**Step 1: Run the F2F suite**

Run:

```
npx vitest run src/lib/norms/f2f src/lib/norms/testing-day-pdf.test.ts src/app/api/athletes/[id]/f2f/route.test.ts
```

Expected: all PASS. If court/board fixtures assumed 5–10 mph Force while also containing 10–20, update expected predicted_40 to reconstruction (same sprint-anchor rules).

**Step 2: Full suite**

Run: `npm test`

Expected: PASS.

**Step 3: Commit leftover docs if uncommitted**

```
git add docs/plans/2026-09-04-f2f-force-515-reconstruction-design.md docs/plans/2026-09-03-force-to-form-design.md
git commit -m "docs: specify Force 5-15 reconstruction from 5-10 and 10-20"
```

Skip this commit if those files are already committed. Do not commit `next.config.ts` or `.env.local`.

---

## Execution notes

- TDD each task. No female table, F-v chart, 0–5, or Form changes.
- Cards already mute `projected`; reconstructed Force needs no new UI.
- After the plan: subagent-driven (this session) or parallel executing-plans session.
