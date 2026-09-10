# Adaptive Weight-Room Card Row Height Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This session uses superpowers:subagent-driven-development (fresh implementer per task, then spec review, then quality review).

**Goal:** Apply adaptive fillable / notes / zero-set row heights on printed workout cards from one shared density function so 15-exercise sheets shrink, short sheets hit inch caps, and scan-safe follows fit (Decision A).

**Architecture:** `computeCardRowHeights(draft)` in `src/lib/weight-room/layout-estimate.ts` owns the inch contract. `analyzeCardFit` uses its `usedHeightIn`. `CardPrintView` sets `--wr-fill-row`, `--wr-notes-row`, `--wr-zero-set-row` from the same function so preview, print, and `html-to-image` PDF cannot drift.

**Tech Stack:** TypeScript, Vitest, existing HTML + print CSS (no new PDF engine).

**Worktree:** `feature/adaptive-card-row-height` at `.worktrees/adaptive-card-row-height`. Do not edit the main checkout. Do not commit `.env.local` or `next.config.ts`.

**Design:** [2026-09-10-adaptive-card-row-height-design.md](./2026-09-10-adaptive-card-row-height-design.md)

**PowerShell:** do not use `&&`. Separate commands with `;`.

**Skills:** @test-driven-development — failing test first, then minimal code. @verification-before-completion before claiming done.

---

### Task 1: Density function and inch constants

**Files:**
- Modify: `src/lib/weight-room/layout-estimate.ts`
- Modify: `src/lib/weight-room/layout-estimate.test.ts`

Do **not** change `analyzeCardFit` yet. Old fit tests must keep passing. Only add `computeCardRowHeights` plus new constants. Leave `MOVEMENT_ROW_IN`, `NOTES_ROW_IN`, `WARMUP_ROW_IN`, `MIN_SCAN_ROW_IN`, and `MAX_SCAN_SAFE_MOVEMENTS` in place until Task 2.

**Step 1: Write the failing tests**

Add a helper next to `tinyDraft` (or a local one) that builds N fillable movements with notes:

```ts
import {
  FILL_ROW_MAX_IN,
  FILL_ROW_MIN_IN,
  HEADER_IN,
  NOTES_ROW_MAX_IN,
  PAGE_BODY_IN,
  TABLE_HEAD_IN,
  ZERO_SET_ROW_MAX_IN,
  computeCardRowHeights,
} from "./layout-estimate";

function notesDraft(count: number): CardDraft {
  return tinyDraft({
    movements: Array.from({ length: count }, (_, i) => ({
      label: String(i + 1),
      name: `Lift ${i + 1}`,
      block: "Main",
      setCount: 3,
      targets: ["5", "5", "5"],
      notes: "Cue",
      fromPair: false,
      exerciseHtml: null,
      speedJournalMetricKey: null,
    })),
  });
}

describe("computeCardRowHeights", () => {
  it("grows a 4-row notes card to fillable and notes max and leaves leftover paper", () => {
    const h = computeCardRowHeights(notesDraft(4));
    expect(h.fillRowIn).toBeCloseTo(FILL_ROW_MAX_IN);
    expect(h.notesRowIn).toBeCloseTo(NOTES_ROW_MAX_IN);
    expect(h.leftoverIn).toBeGreaterThan(0);
    expect(h.usedHeightIn).toBeLessThanOrEqual(PAGE_BODY_IN);
    expect(h.usedHeightIn).toBeCloseTo(
      HEADER_IN + TABLE_HEAD_IN + 4 * h.fillRowIn + 4 * h.notesRowIn
    );
  });

  it("grows an 8-row all-notes card to max caps", () => {
    const h = computeCardRowHeights(notesDraft(8));
    expect(h.fillRowIn).toBeCloseTo(FILL_ROW_MAX_IN);
    expect(h.notesRowIn).toBeCloseTo(NOTES_ROW_MAX_IN);
  });

  it("keeps a 13-row all-notes card near ideal", () => {
    const h = computeCardRowHeights(notesDraft(13));
    expect(h.fillRowIn).toBeGreaterThan(0.3);
    expect(h.fillRowIn).toBeLessThan(0.34);
    expect(h.notesRowIn).toBeGreaterThan(0.18);
    expect(h.notesRowIn).toBeLessThan(0.2);
  });

  it("shrinks a 15-row all-notes card toward mins but still fits the grid", () => {
    const h = computeCardRowHeights(notesDraft(15));
    expect(h.fillRowIn).toBeLessThan(5 / 16);
    expect(h.fillRowIn).toBeGreaterThanOrEqual(FILL_ROW_MIN_IN);
    expect(h.usedHeightIn).toBeLessThanOrEqual(PAGE_BODY_IN);
  });

  it("applies mins when even the min pack overflows", () => {
    const h = computeCardRowHeights(notesDraft(24));
    expect(h.fillRowIn).toBeCloseTo(FILL_ROW_MIN_IN);
    expect(h.usedHeightIn).toBeGreaterThan(PAGE_BODY_IN);
  });

  it("uses the zero-set band for a 0-set warmup, not a fixed 0.40in", () => {
    const draft = tinyDraft({
      movements: [
        {
          label: "W",
          name: "Prep",
          block: "Warmup",
          setCount: 0,
          targets: [],
          notes: "Med-ball",
          fromPair: false,
          exerciseHtml: null,
          speedJournalMetricKey: null,
        },
        {
          label: "1",
          name: "Squat",
          block: "Main",
          setCount: 3,
          targets: ["5", "5", "5"],
          notes: "",
          fromPair: false,
          exerciseHtml: null,
          speedJournalMetricKey: null,
        },
      ],
    });
    const h = computeCardRowHeights(draft);
    expect(h.zeroSetRowIn).toBeGreaterThanOrEqual(1 / 4);
    expect(h.zeroSetRowIn).toBeLessThanOrEqual(ZERO_SET_ROW_MAX_IN);
    expect(h.zeroSetRowIn).not.toBeCloseTo(0.4);
    expect(h.usedHeightIn).toBeCloseTo(
      HEADER_IN + TABLE_HEAD_IN + h.zeroSetRowIn + h.fillRowIn
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```powershell
npx vitest run src/lib/weight-room/layout-estimate.test.ts
```

Expected: FAIL — `computeCardRowHeights` / new constants are not exported.

**Step 3: Write minimal implementation**

In `layout-estimate.ts`, add (keep existing `analyzeCardFit` untouched):

```ts
export const FILL_ROW_MIN_IN = 3 / 16;
export const FILL_ROW_IDEAL_IN = 5 / 16;
export const FILL_ROW_MAX_IN = 7 / 16;

export const NOTES_ROW_MIN_IN = 1 / 8;
export const NOTES_ROW_IDEAL_IN = 3 / 16;
export const NOTES_ROW_MAX_IN = 1 / 4;

export const ZERO_SET_ROW_MIN_IN = 1 / 4;
export const ZERO_SET_ROW_IDEAL_IN = 5 / 16;
export const ZERO_SET_ROW_MAX_IN = 3 / 8;

export type CardRowHeights = {
  fillRowIn: number;
  notesRowIn: number;
  zeroSetRowIn: number;
  usedHeightIn: number;
  leftoverIn: number;
};

function isZeroSetMovement(setCount: number): boolean {
  return setCount <= 0;
}

function lerp(from: number, to: number, t: number): number {
  return from + t * (to - from);
}

function growTowardMax(
  current: number,
  max: number,
  count: number,
  leftover: number
): { height: number; leftover: number } {
  if (count <= 0 || leftover <= 0) return { height: current, leftover };
  const add = Math.min(max - current, leftover / count);
  return { height: current + add, leftover: leftover - add * count };
}

export function computeCardRowHeights(draft: CardDraft): CardRowHeights {
  let nFill = 0;
  let nNotes = 0;
  let nZero = 0;
  for (const m of draft.movements) {
    if (isZeroSetMovement(m.setCount)) {
      nZero += 1;
    } else {
      nFill += 1;
      if (m.notes.trim()) nNotes += 1;
    }
  }

  const available = PAGE_BODY_IN - HEADER_IN - TABLE_HEAD_IN;
  const idealSum =
    nFill * FILL_ROW_IDEAL_IN +
    nNotes * NOTES_ROW_IDEAL_IN +
    nZero * ZERO_SET_ROW_IDEAL_IN;
  const minSum =
    nFill * FILL_ROW_MIN_IN +
    nNotes * NOTES_ROW_MIN_IN +
    nZero * ZERO_SET_ROW_MIN_IN;

  let fillRowIn = FILL_ROW_IDEAL_IN;
  let notesRowIn = NOTES_ROW_IDEAL_IN;
  let zeroSetRowIn = ZERO_SET_ROW_IDEAL_IN;

  if (idealSum <= available) {
    let leftover = available - idealSum;
    const fillGrown = growTowardMax(fillRowIn, FILL_ROW_MAX_IN, nFill, leftover);
    fillRowIn = fillGrown.height;
    leftover = fillGrown.leftover;
    const zeroGrown = growTowardMax(
      zeroSetRowIn,
      ZERO_SET_ROW_MAX_IN,
      nZero,
      leftover
    );
    zeroSetRowIn = zeroGrown.height;
    leftover = zeroGrown.leftover;
    const notesGrown = growTowardMax(
      notesRowIn,
      NOTES_ROW_MAX_IN,
      nNotes,
      leftover
    );
    notesRowIn = notesGrown.height;
  } else if (minSum > available) {
    fillRowIn = FILL_ROW_MIN_IN;
    notesRowIn = NOTES_ROW_MIN_IN;
    zeroSetRowIn = ZERO_SET_ROW_MIN_IN;
  } else {
    const t = (idealSum - available) / (idealSum - minSum);
    fillRowIn = lerp(FILL_ROW_IDEAL_IN, FILL_ROW_MIN_IN, t);
    notesRowIn = lerp(NOTES_ROW_IDEAL_IN, NOTES_ROW_MIN_IN, t);
    zeroSetRowIn = lerp(ZERO_SET_ROW_IDEAL_IN, ZERO_SET_ROW_MIN_IN, t);
  }

  const rowsHeight =
    nFill * fillRowIn + nNotes * notesRowIn + nZero * zeroSetRowIn;
  const usedHeightIn = HEADER_IN + TABLE_HEAD_IN + rowsHeight;
  return {
    fillRowIn,
    notesRowIn,
    zeroSetRowIn,
    usedHeightIn,
    leftoverIn: Math.max(0, PAGE_BODY_IN - usedHeightIn),
  };
}
```

**Step 4: Run tests to verify they pass**

```powershell
npx vitest run src/lib/weight-room/layout-estimate.test.ts
```

Expected: PASS (old `analyzeCardFit` tests still use the old constants).

**Step 5: Commit**

```powershell
git add src/lib/weight-room/layout-estimate.ts src/lib/weight-room/layout-estimate.test.ts
git commit -m "feat(weight-room): compute adaptive card row heights from draft density"
```

---

### Task 2: Fit and scan-safe use applied heights

**Files:**
- Modify: `src/lib/weight-room/layout-estimate.ts`
- Modify: `src/lib/weight-room/layout-estimate.test.ts`

**Step 1: Write the failing tests (update existing ones that the new rules change)**

Replace the “13 dummy rows is not scan-safe” case and the “20 overflows” case:

```ts
it("marks 15 noted dummy rows scan-safe when they fit at shrunk heights", () => {
  const r = analyzeCardFit(makeStressDraft(15));
  expect(r.fits).toBe(true);
  expect(r.scanSafe).toBe(true);
  expect(r.warnings.some((w) => /scan-safe max of 12/i.test(w))).toBe(false);
});

it("treats 13 dummy rows as scan-safe (no movement-count cap)", () => {
  const r = analyzeCardFit(makeStressDraft(13));
  expect(r.fits).toBe(true);
  expect(r.scanSafe).toBe(true);
  expect(crowdingPrintWarning(r)).toBeNull();
});

it("overflows when the min pack exceeds the page body", () => {
  const overflow = analyzeCardFit(makeStressDraft(24));
  expect(overflow.fits).toBe(false);
  expect(overflow.scanSafe).toBe(false);
  expect(overflow.estimatedHeightIn).toBeGreaterThan(PAGE_BODY_IN);
  expect(crowdingPrintWarning(overflow)).toMatch(/check the preview/i);
});

it("keeps estimatedHeightIn equal to computeCardRowHeights usedHeightIn", () => {
  const draft = makeStressDraft(8);
  const r = analyzeCardFit(draft);
  expect(r.estimatedHeightIn).toBeCloseTo(computeCardRowHeights(draft).usedHeightIn);
});
```

Keep the “too many sets” test. Keep Week 1 Monday / sample soccer as fit + scan-safe. Change “eventually overflows when dummy rows pile up” to use 8 (fits) vs 24 (overflow), not 20.

**Step 2: Run tests to verify they fail**

```powershell
npx vitest run src/lib/weight-room/layout-estimate.test.ts
```

Expected: FAIL — `analyzeCardFit` still uses the 12-movement cap and fixed `0.28` / `0.16` / `0.40` heights.

**Step 3: Write minimal implementation**

Rewrite `analyzeCardFit` to call `computeCardRowHeights`. Delete `movementHeight` and the unused constants (`MOVEMENT_ROW_IN`, `NOTES_ROW_IN`, `WARMUP_ROW_IN`, `MIN_SCAN_ROW_IN`, `MAX_SCAN_SAFE_MOVEMENTS`). `scanSafe = fits && maxSets <= MAX_SCAN_SAFE_SETS`. Drop movement-count and `rowBudget` warnings.

```ts
export function analyzeCardFit(draft: CardDraft): CardFit {
  const heights = computeCardRowHeights(draft);
  const movementCount = draft.movements.length;
  const maxSets = draft.movements.reduce(
    (max, m) => Math.max(max, m.setCount),
    0
  );
  const estimatedHeightIn = heights.usedHeightIn;
  const fits = estimatedHeightIn <= PAGE_BODY_IN;
  const warnings: string[] = [];

  if (!fits) {
    warnings.push(
      `Estimated ${estimatedHeightIn.toFixed(2)}in exceeds ${PAGE_BODY_IN}in page body`
    );
  }
  if (maxSets > MAX_SCAN_SAFE_SETS) {
    warnings.push(
      `${maxSets} set columns is above the scan-safe max of ${MAX_SCAN_SAFE_SETS}`
    );
  }

  return {
    estimatedHeightIn,
    pageBodyIn: PAGE_BODY_IN,
    fits,
    scanSafe: fits && maxSets <= MAX_SCAN_SAFE_SETS,
    movementCount,
    maxSets,
    warnings,
  };
}
```

Grep the repo for deleted constant names and fix any leftover imports (should be test-only).

**Step 4: Run tests**

```powershell
npx vitest run src/lib/weight-room/layout-estimate.test.ts src/lib/weight-room/preview-items.ts
npx vitest run src/lib/weight-room
```

Expected: PASS. If `preview-items` or another file imported deleted constants, update the import only (no hint copy yet — Task 4).

**Step 5: Commit**

```powershell
git add src/lib/weight-room/layout-estimate.ts src/lib/weight-room/layout-estimate.test.ts
git commit -m "feat(weight-room): score card fit from applied row heights"
```

---

### Task 3: Print view applies CSS row variables

**Files:**
- Modify: `src/app/weight-room/components/CardPrintView.tsx`
- Modify: `src/app/weight-room/components/card-print.css`
- Modify: `src/lib/weight-room/layout-estimate.ts`
- Modify: `src/lib/weight-room/layout-estimate.test.ts`

**Step 1: Write the failing test for CSS var formatting**

```ts
it("formats applied heights as inch CSS variables", () => {
  const vars = sheetRowCssVars(computeCardRowHeights(notesDraft(4)));
  expect(vars["--wr-fill-row"]).toBe(`${FILL_ROW_MAX_IN}in`);
  expect(vars["--wr-notes-row"]).toBe(`${NOTES_ROW_MAX_IN}in`);
  expect(vars["--wr-zero-set-row"]).toMatch(/in$/);
});
```

**Step 2: Run to verify fail**

```powershell
npx vitest run src/lib/weight-room/layout-estimate.test.ts
```

Expected: FAIL — `sheetRowCssVars` missing.

**Step 3: Implement helper + wire print view + CSS**

```ts
export function sheetRowCssVars(heights: CardRowHeights): {
  "--wr-fill-row": string;
  "--wr-notes-row": string;
  "--wr-zero-set-row": string;
} {
  return {
    "--wr-fill-row": `${heights.fillRowIn}in`,
    "--wr-notes-row": `${heights.notesRowIn}in`,
    "--wr-zero-set-row": `${heights.zeroSetRowIn}in`,
  };
}
```

In `CardPrintView`:

- Import `computeCardRowHeights` and `sheetRowCssVars`.
- Treat `setCount <= 0` as the zero-set spanning row (same markup as today’s warmup). Keep warmup color/italic when `block` is warmup.
- Add class `wr-fill-row` on fillable result rows and `wr-zero-set` on zero-set rows.
- Merge CSS vars onto `.wr-sheet` style with the existing `--wr-header-bg`.

```tsx
const heights = computeCardRowHeights(draft);
const rowVars = sheetRowCssVars(heights);
// style={{ ["--wr-header-bg" as string]: headerBg(draft), ...rowVars }}
```

In `card-print.css`:

- Remove `.wr-result { min-height: 1.55em; padding-top: 0.4em; padding-bottom: 0.4em; }`. Keep `background: #fff`.
- Set fillable target/result cells:

```css
.wr-fill-row > .wr-target,
.wr-fill-row > .wr-result {
  height: var(--wr-fill-row);
  padding-top: 0.08em;
  padding-bottom: 0.08em;
  box-sizing: border-box;
}

.wr-notes td {
  height: var(--wr-notes-row);
  box-sizing: border-box;
}

.wr-zero-set > td {
  height: var(--wr-zero-set-row);
  box-sizing: border-box;
}
```

Do not change `.wr-sheet` `min-height: 7.8in`, fiducials, or `@page` margins.

**Step 4: Run tests**

```powershell
npx vitest run src/lib/weight-room/layout-estimate.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/lib/weight-room/layout-estimate.ts src/lib/weight-room/layout-estimate.test.ts src/app/weight-room/components/CardPrintView.tsx src/app/weight-room/components/card-print.css
git commit -m "feat(weight-room): apply adaptive row heights on printed cards"
```

---

### Task 4: Preview and editor copy

**Files:**
- Modify: `src/lib/weight-room/preview-items.ts`
- Modify: `src/app/weight-room/preview/PreviewGallery.tsx`
- Modify: `src/app/weight-room/cards/[id]/CardEditor.tsx`
- Create: `src/lib/weight-room/preview-items.test.ts` (only if no existing test file)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getPreviewCatalog } from "./preview-items";

describe("getPreviewCatalog density hints", () => {
  it("does not treat 14 rows as past a hard scan-safe movement cap", () => {
    const item = getPreviewCatalog().find((i) => i.id === "stress-14");
    expect(item).toBeTruthy();
    expect(item!.hint).not.toMatch(/scan-safe cap/i);
    expect(item!.fit.scanSafe).toBe(true);
  });
});
```

**Step 2: Run to verify fail**

```powershell
npx vitest run src/lib/weight-room/preview-items.test.ts
```

Expected: FAIL — hint still says “Past the scan-safe cap”.

**Step 3: Minimal copy updates**

`preview-items.ts` hints:

- `stress-12`: “Comfortable dense sheet — heights shrink from ideal.”
- `stress-14`: “Dense noted rows; should still fit and stay scan-safe.”
- `stress-16`: “Heavier shrink; check Load×Reps cell height in the preview.”
- `stress-20`: “Near the min pack; confirm it still fits one page.”
- Keep `stress-8` as a comfortable / leftover-grow example.

`PreviewGallery.tsx` scan label when safe: `Scan-safe (fits at or above minimum row heights; set columns within budget)`.

`CardEditor.tsx` scan-safe line: same idea — drop “row count … within budget” / any 12-cap wording. Unsafe: keep “Not scan-safe — crowding or too many set columns”.

**Step 4: Run tests**

```powershell
npx vitest run src/lib/weight-room/preview-items.test.ts src/lib/weight-room/layout-estimate.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/lib/weight-room/preview-items.ts src/lib/weight-room/preview-items.test.ts src/app/weight-room/preview/PreviewGallery.tsx src/app/weight-room/cards/[id]/CardEditor.tsx
git commit -m "docs(weight-room): drop the 12-row scan-safe cap from card copy"
```

---

## Verification (after all tasks)

```powershell
npx vitest run src/lib/weight-room
```

Manually (when a browser is available): `/weight-room/preview` — 8-row vs 15-row vs 24-row dummy cards; confirm row height changes and the sheet stays one landscape page until overflow.
