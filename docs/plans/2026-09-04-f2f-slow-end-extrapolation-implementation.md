# F2F Slow-End Extrapolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extrapolate XPE lookups past the slow floor with a cached OLS fit on the slowest third of each table, label women from that shape, and keep per-quality predicted 40s (and Ref 40) male-only.

**Architecture:** Pure lookup in `src/lib/norms/f2f/lookup.ts` plus cached points/fits in `tables.ts`. `buildF2fProfile` still computes predicted 40s for everyone; it sets `eligible_for_labels` for M/F and `show_predicted_40s` for men only. Strip, athlete page, and coach PDF hide 40 numerals when the flag is false. Do not invent predicted 40s in React or the PDF.

**Tech Stack:** TypeScript, Vitest, existing XPE JSON under `src/lib/norms/f2f/tables/`.

**Worktree:** `feature/force-to-form` at `.worktrees/force-to-form` (already isolated). Do not create a second worktree.

**Design:** [2026-09-04-f2f-slow-end-extrapolation-design.md](./2026-09-04-f2f-slow-end-extrapolation-design.md)

**PowerShell:** do not use `&&`. Separate commands with `;`.

**Dirty tree:** this worktree already has unrelated PDF edits. Commit only the files listed in each task.

---

### Task 1: Slow-tail OLS in the lookup

**Files:**
- Modify: `src/lib/norms/f2f/lookup.ts`
- Modify: `src/lib/norms/f2f/lookup.test.ts`
- Modify: `src/lib/norms/f2f/tables.ts`
- Modify: `src/lib/norms/f2f/resolve-mark.ts`
- Modify: `src/lib/norms/f2f/resolve-mark.test.ts`

**Step 1: Write the failing lookup tests**

Replace `src/lib/norms/f2f/lookup.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  fitSlowTail,
  interpolatePredicted40,
  type LookupPoint,
} from "./lookup";

const mphLike: LookupPoint[] = [
  { x: 8, y: 4.82 },
  { x: 9, y: 4.64 },
  { x: 10, y: 4.47 },
];

const timeLike: LookupPoint[] = [
  { x: 1.1, y: 4.2 },
  { x: 1.2, y: 4.5 },
  { x: 1.3, y: 4.8 },
  { x: 1.4, y: 5.1 },
  { x: 1.5, y: 5.4 },
];

describe("fitSlowTail", () => {
  it("fits OLS on the slowest third (all 3 when n is 3)", () => {
    const fit = fitSlowTail(mphLike);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(-0.175, 6);
    expect(fit!.intercept).toBeCloseTo(6.218333, 5);
  });

  it("uses the three highest predicted 40s when n is 5", () => {
    const fit = fitSlowTail(timeLike);
    expect(fit!.slope).toBeCloseTo(3, 8);
    expect(fit!.intercept).toBeCloseTo(0.9, 8);
  });

  it("returns null for fewer than two points", () => {
    expect(fitSlowTail([{ x: 1, y: 5 }])).toBeNull();
  });
});

describe("interpolatePredicted40", () => {
  it("returns the exact row", () => {
    expect(interpolatePredicted40(mphLike, 9)).toEqual({
      predicted_40: 4.64,
      extrapolated: false,
    });
  });

  it("interpolates between neighbors", () => {
    const mid = interpolatePredicted40(mphLike, 9.5);
    expect(mid!.extrapolated).toBe(false);
    expect(mid!.predicted_40).toBeCloseTo(4.555, 3);
  });

  it("extrapolates past the slow mph/distance edge and still clamps the fast edge", () => {
    const slow = interpolatePredicted40(mphLike, 7);
    expect(slow!.extrapolated).toBe(true);
    expect(slow!.predicted_40).toBeCloseTo(4.993333, 5);
    expect(slow!.predicted_40).not.toBe(4.82);

    const fast = interpolatePredicted40(mphLike, 11);
    expect(fast!.predicted_40).toBe(4.47);
    expect(fast!.extrapolated).toBe(true);
  });

  it("extrapolates past the slow time edge", () => {
    const hit = interpolatePredicted40(timeLike, 1.6);
    expect(hit!.extrapolated).toBe(true);
    expect(hit!.predicted_40).toBeCloseTo(5.7, 8);
  });

  it("clamps when the tail slope would make a slower mark faster", () => {
    const bent: LookupPoint[] = [
      { x: 1, y: 5.0 },
      { x: 2, y: 5.2 },
      { x: 3, y: 4.0 },
    ];
    const hit = interpolatePredicted40(bent, 0);
    expect(hit!.predicted_40).toBe(5.0);
    expect(hit!.extrapolated).toBe(true);
  });

  it("returns null for a non-finite x or empty table", () => {
    expect(interpolatePredicted40(mphLike, Number.NaN)).toBeNull();
    expect(interpolatePredicted40([], 9)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/f2f/lookup.test.ts`

Expected: FAIL (`fitSlowTail` not exported; slow-side still clamps to 4.82).

**Step 3: Implement lookup + cache fits**

`src/lib/norms/f2f/lookup.ts`:

```ts
export type LookupPoint = { x: number; y: number };

export type LookupHit = {
  predicted_40: number;
  extrapolated: boolean;
};

export type SlowTailFit = {
  intercept: number;
  slope: number;
};

export function slowTailCount(n: number): number {
  if (n < 2) return n;
  if (n < 3) return 2;
  return Math.max(3, Math.ceil(n / 3));
}

export function fitSlowTail(points: LookupPoint[]): SlowTailFit | null {
  if (points.length < 2) return null;
  const tail = [...points]
    .toSorted((a, b) => b.y - a.y)
    .slice(0, slowTailCount(points.length));
  const n = tail.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of tail) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
  return { intercept, slope };
}

function evaluateFit(fit: SlowTailFit, x: number): number | null {
  const y = fit.intercept + fit.slope * x;
  return Number.isFinite(y) ? y : null;
}

export function interpolatePredicted40(
  points: LookupPoint[],
  x: number,
  fit?: SlowTailFit | null
): LookupHit | null {
  if (!Number.isFinite(x) || points.length === 0) return null;
  const sorted = [...points].toSorted((a, b) => a.x - b.x);
  const lo = sorted[0];
  const last = sorted[sorted.length - 1];
  const resolvedFit = fit === undefined ? fitSlowTail(points) : fit;
  const slowIsLowX = lo.y >= last.y;

  if (x < lo.x) {
    if (slowIsLowX && resolvedFit && resolvedFit.slope < 0) {
      const y = evaluateFit(resolvedFit, x);
      if (y != null) return { predicted_40: y, extrapolated: true };
    }
    return { predicted_40: lo.y, extrapolated: true };
  }
  if (x > last.x) {
    if (!slowIsLowX && resolvedFit && resolvedFit.slope > 0) {
      const y = evaluateFit(resolvedFit, x);
      if (y != null) return { predicted_40: y, extrapolated: true };
    }
    return { predicted_40: last.y, extrapolated: true };
  }
  if (x <= lo.x) {
    return { predicted_40: lo.y, extrapolated: false };
  }
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return {
        predicted_40: a.y + t * (b.y - a.y),
        extrapolated: false,
      };
    }
  }
  return { predicted_40: last.y, extrapolated: true };
}
```

Cache stable arrays and fits in `tables.ts` (compute once at module load). Export `broadSlowFit`, `forceMphSlowFit`, `forceTimeSlowFit`, and `formMphSlowFit(split?)`. `resolve-mark.ts` passes those fits as the third argument to `interpolatePredicted40`.

**Step 4: Add a resolve-mark regression case**

Append to `resolve-mark.test.ts`:

```ts
  it("extrapolates a 5-15 slower than the XPE floor instead of clamping", () => {
    const edge = resolveForce({ timeS: 1.39, yards: 10, lookup: "time" });
    const slower = resolveForce({ timeS: 1.5, yards: 10, lookup: "time" });
    expect(edge?.predicted_40).toBeCloseTo(5.71, 2);
    expect(slower?.extrapolated).toBe(true);
    expect(slower!.predicted_40).toBeGreaterThan(edge!.predicted_40);
  });
```

**Step 5: Run tests**

Run: `npx vitest run src/lib/norms/f2f/lookup.test.ts src/lib/norms/f2f/resolve-mark.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/norms/f2f/lookup.ts src/lib/norms/f2f/lookup.test.ts src/lib/norms/f2f/tables.ts src/lib/norms/f2f/resolve-mark.ts src/lib/norms/f2f/resolve-mark.test.ts
git commit -m "feat: extrapolate F2F lookups past the slow XPE floor"
```

---

### Task 2: Labels for women, predicted 40s male-only

**Files:**
- Modify: `src/lib/norms/f2f/types.ts`
- Modify: `src/lib/norms/f2f/profile.ts`
- Modify: `src/lib/norms/f2f/profile.test.ts`
- Modify: `src/lib/norms/f2f/board.test.ts`
- Modify: `src/lib/norms/f2f/themes.test.ts`
- Modify: `src/lib/norms/testing-day-pdf.test.ts` (add `show_predicted_40s` on stub profiles)
- Modify: `src/lib/norms/testing-day-pdf-f2f.test.ts` (same)
- Modify: `src/app/api/athletes/[id]/f2f/route.test.ts` (same)

**Step 1: Write the failing profile tests**

Add `show_predicted_40s: true` to the first male case expectations.

Replace the girls test and add an off-table pair:

```ts
  it("labels women from shape and hides predicted 40s", () => {
    const marks = [
      { metric_key: "Standing-Broad", component: null, display_value: 8 },
      { metric_key: "40yd_Dash", component: "5-15yd", display_value: 1.5 },
      { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.2 },
    ];
    const woman = buildF2fProfile(marks, { gender: "F" });
    expect(woman.eligible_for_labels).toBe(true);
    expect(woman.show_predicted_40s).toBe(false);
    expect(woman.primary).toBe("force");
    expect(woman.flags).toContain("force");
    expect(woman.force?.extrapolated).toBe(true);
    expect(woman.force!.predicted_40).toBeGreaterThan(5.71);

    const man = buildF2fProfile(marks, male);
    expect(man.primary).toBe("force");
    expect(man.show_predicted_40s).toBe(true);
    expect(man.eligible_for_labels).toBe(true);
  });

  it("does not label unknown gender", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 8 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.2 },
      ],
      { gender: null }
    );
    expect(profile.eligible_for_labels).toBe(false);
    expect(profile.show_predicted_40s).toBe(false);
    expect(profile.primary).toBeNull();
  });
```

Delete `returns vertices without labels for girls` (the 8 ft + 5.2 forty case only has Explosion — that already has `leaves primary null when fewer than two qualities`).

Update every `F2fProfile` object literal in tests to include `show_predicted_40s` (male stubs `true`, Ann/unlabeled `false`) so TypeScript compiles after the type change.

**Step 2: Run profile tests — expect FAIL**

Run: `npx vitest run src/lib/norms/f2f/profile.test.ts`

Expected: FAIL (`show_predicted_40s` missing; woman still unlabeled).

**Step 3: Implement profile flags**

In `types.ts` add `show_predicted_40s: boolean` to `F2fProfile`.

In `profile.ts` replace the `canLabel` / return blocks:

```ts
  const show_predicted_40s = athlete.gender === "M";
  const canLabel =
    (athlete.gender === "M" || athlete.gender === "F") &&
    qualities.length >= 2 &&
    reference_40 != null &&
    Number.isFinite(reference_40);

  if (!canLabel) {
    return {
      reference_40,
      reference_source,
      explosion,
      force,
      form,
      eligible_for_labels: false,
      show_predicted_40s,
      flags: [],
      primary: null,
    };
  }

  const { flags, primary } = classify(qualities, reference_40);
  return {
    reference_40,
    reference_source,
    explosion,
    force,
    form,
    eligible_for_labels: true,
    show_predicted_40s,
    flags,
    primary,
  };
```

**Step 4: Fix board + theme tests**

`board.test.ts` first case: girl with `BATTERY` is now labeled.

```ts
    expect(result.athletes[1].f2f?.eligible_for_labels).toBe(true);
    expect(result.athletes[1].f2f?.show_predicted_40s).toBe(false);
    expect(result.athletes[0].f2f?.show_predicted_40s).toBe(true);
    expect(result.f2f_themes.session.eligible_count).toBe(2);
    expect(result.f2f_themes.groups.some((group) => group.gender === "F")).toBe(
      true
    );
```

Second case (builder throws for men): girl with `BATTERY` is labeled, so `eligible_count` becomes `1`. Update:

```ts
    expect(result.athletes[1].f2f?.eligible_for_labels).toBe(true);
    expect(result.f2f_themes.session.eligible_count).toBe(1);
```

`themes.test.ts` — change the excluded girl into a labeled woman and expect a soccer · F group:

```ts
      athlete({
        id: "g",
        gender: "F",
        eligible_for_labels: true,
        primary: "explosion",
        reference_40: 5.4,
      }),
```

```ts
    const soccerF = themes.groups.find(
      (g) => g.sport === "soccer" && g.gender === "F"
    );
    expect(soccerF?.eligible_count).toBe(1);
    expect(soccerF?.mix.explosion).toBe(1);
```

Remove `expect(themes.groups.some((g) => g.gender === "F")).toBe(false)`.

**Step 5: Run tests**

Run: `npx vitest run src/lib/norms/f2f/profile.test.ts src/lib/norms/f2f/board.test.ts src/lib/norms/f2f/themes.test.ts src/lib/norms/testing-day-pdf.test.ts src/lib/norms/testing-day-pdf-f2f.test.ts src/app/api/athletes/[id]/f2f/route.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/norms/f2f/types.ts src/lib/norms/f2f/profile.ts src/lib/norms/f2f/profile.test.ts src/lib/norms/f2f/board.test.ts src/lib/norms/f2f/themes.test.ts src/lib/norms/testing-day-pdf.test.ts src/lib/norms/testing-day-pdf-f2f.test.ts src/app/api/athletes/[id]/f2f/route.test.ts
git commit -m "feat: label women on F2F shape and keep predicted 40s male-only"
```

---

### Task 3: Hide 40 numerals on women’s surfaces

**Files:**
- Modify: `src/lib/norms/f2f/labels.ts`
- Modify: `src/lib/norms/f2f/labels.test.ts`
- Modify: `src/app/reporting/testing-day/F2fStrip.tsx`
- Modify: `src/app/athletes/F2fSection.tsx`
- Modify: `src/lib/norms/testing-day-pdf.tsx`
- Modify: `src/lib/norms/testing-day-pdf-f2f.ts` (optional heading helper)
- Modify: `src/lib/norms/testing-day-pdf-f2f.test.ts`

**Step 1: Write failing display-helper tests**

Append to `labels.test.ts`:

```ts
import { f2fChipLabel, formatQualityMark, f2fShowsPredicted40s } from "./labels";
import type { F2fProfile } from "./types";

const baseProfile: F2fProfile = {
  reference_40: 5.2,
  reference_source: "actual_40",
  explosion: null,
  force: null,
  form: null,
  eligible_for_labels: true,
  show_predicted_40s: false,
  flags: ["force"],
  primary: "force",
};

describe("f2fShowsPredicted40s", () => {
  it("is true only when the profile opts in", () => {
    expect(f2fShowsPredicted40s(baseProfile)).toBe(false);
    expect(
      f2fShowsPredicted40s({ ...baseProfile, show_predicted_40s: true })
    ).toBe(true);
    expect(f2fShowsPredicted40s(null)).toBe(false);
  });
});
```

Add `f2fCardHeading` tests in `testing-day-pdf-f2f.test.ts` (name only vs `Name: 5.20 40yd`).

Rename the focus-badge test from “is male-only” to “follows eligible_for_labels” (behavior already correct once women are labeled).

**Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/norms/f2f/labels.test.ts src/lib/norms/testing-day-pdf-f2f.test.ts`

Expected: FAIL (`f2fShowsPredicted40s` / `f2fCardHeading` missing).

**Step 3: Implement helpers + gate UI/PDF**

`labels.ts`:

```ts
export function f2fShowsPredicted40s(
  profile: { show_predicted_40s?: boolean } | null | undefined
): boolean {
  return Boolean(profile?.show_predicted_40s);
}
```

`testing-day-pdf-f2f.ts`:

```ts
export function f2fCardHeading(
  name: string,
  profile: F2fProfile | null | undefined
): string {
  if (
    f2fShowsPredicted40s(profile) &&
    profile?.reference_40 != null &&
    Number.isFinite(profile.reference_40)
  ) {
    return `${name}: ${profile.reference_40.toFixed(2)} 40yd`;
  }
  return name;
}
```

`F2fStrip.tsx` `AthleteCard`: wrap Ref 40 and the three `<PredictedForty>` items in `f2fShowsPredicted40s(f2f)`. Do not render `—` placeholders.

`F2fSection.tsx`: same gate around Ref 40 and the Explosion / Force / Form list.

`testing-day-pdf.tsx` `CoachF2fCard`:
- Title via `f2fCardHeading(athleteDisplayName(athlete), profile)`
- Render `F2fTraitLine`s only when `f2fShowsPredicted40s(profile)`
- Keep chip + triangle for women

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/f2f src/lib/norms/testing-day-pdf-f2f.test.ts src/lib/norms/testing-day-pdf.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/norms/f2f/labels.ts src/lib/norms/f2f/labels.test.ts src/app/reporting/testing-day/F2fStrip.tsx src/app/athletes/F2fSection.tsx src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf-f2f.ts src/lib/norms/testing-day-pdf-f2f.test.ts
git commit -m "feat: hide F2F predicted 40s on women's cards and PDFs"
```

---

### Done when

- A 5–15 slower than 1.39s predicts slower than 5.71 (not the floor).
- Fast-end marks still clamp.
- Woman with a strong jump and a slow Force gets `Force-deficient`, no Ref/quality 40s on strip, athlete page, or coach card.
- Man with the same marks still sees the three predicted 40s.
- Girls volleyball theme groups can have an eligible count > 0.
