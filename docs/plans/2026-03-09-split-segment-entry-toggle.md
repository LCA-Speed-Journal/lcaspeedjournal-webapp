# Split-Segment Entry Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users enter cumulative-metric split times as either cumulative (time at each split) or segment (time per segment); convert segment → cumulative before send so storage and API stay unchanged.

**Architecture:** Add a client-only toggle on the data-entry form and on edit-entry raw mode. When "Segment" is selected, convert pipe/comma-separated segment values to cumulative via a running sum before sending `raw_input`. Store only cumulative; no new API params or DB columns. Shared conversion lives in the parser module.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest. Existing: `src/lib/parser.ts`, `src/app/data-entry/EntryForm.tsx`, `src/app/data-entry/session/[id]/EditSessionClient.tsx`.

---

## Task 1: segmentToCumulative utility and tests

**Files:**
- Create: `src/lib/parser.test.ts`
- Modify: `src/lib/parser.ts` (add and export `segmentToCumulative` and `segmentInputToCumulativeInput`)

**Step 1: Write the failing tests**

In `src/lib/parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { segmentToCumulative, segmentInputToCumulativeInput } from "./parser";

describe("segmentToCumulative", () => {
  it("returns running sum of segment values", () => {
    expect(segmentToCumulative([1, 2, 3])).toEqual([1, 3, 6]);
  });

  it("returns single value unchanged", () => {
    expect(segmentToCumulative([0.95])).toEqual([0.95]);
  });

  it("handles decimal segment times", () => {
    expect(segmentToCumulative([0.95, 0.9, 0.8])).toEqual([0.95, 1.85, 2.65]);
  });
});

describe("segmentInputToCumulativeInput", () => {
  it("converts pipe-separated segment string to cumulative string", () => {
    expect(segmentInputToCumulativeInput("0.95|0.90|0.80")).toBe("0.95|1.85|2.65");
  });

  it("returns null when any part is non-numeric", () => {
    expect(segmentInputToCumulativeInput("0.95|foo|0.80")).toBeNull();
    expect(segmentInputToCumulativeInput("")).toBeNull();
  });

  it("trims parts", () => {
    expect(segmentInputToCumulativeInput(" 0.95 | 0.90 | 0.80 ")).toBe("0.95|1.85|2.65");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/parser.test.ts`
Expected: FAIL (segmentToCumulative / segmentInputToCumulativeInput not defined or not exported)

**Step 3: Implement in parser.ts**

In `src/lib/parser.ts`, after the existing `splitValues` function (around line 37), add:

```ts
/**
 * Convert segment times to cumulative (running sum). Used when user enters
 * segment times; we convert before sending so backend always receives cumulative.
 */
export function segmentToCumulative(segmentValues: number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const v of segmentValues) {
    sum += v;
    out.push(sum);
  }
  return out;
}

/**
 * Parse pipe/comma-separated segment input and return cumulative string, or null if invalid.
 */
export function segmentInputToCumulativeInput(raw: string): string | null {
  const parts = raw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const nums = parts.map((p) => parseFloat(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const cumulative = segmentToCumulative(nums);
  return cumulative.join("|");
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts
git commit -m "feat(parser): add segmentToCumulative and segmentInputToCumulativeInput"
```

---

## Task 2: EntryForm — toggle state, UI, hint, submit conversion

**Files:**
- Modify: `src/app/data-entry/EntryForm.tsx`

**Step 1: Add state and toggle UI**

In `EntryForm.tsx`:
- Add state: `const [splitEntryMode, setSplitEntryMode] = useState<'cumulative' | 'segment'>('cumulative');`
- When `showMobileSplits` is true, render a small control above the split inputs (above the "Value" label or directly under it): two options "Cumulative" | "Segment" (e.g. two buttons or radio group). Use existing border/surface classes for consistency. Default "Cumulative".
- Reset `splitEntryMode` to `'cumulative'` when metric or session changes (e.g. in the same places where `setSplitValues([])` or `setRawInput("")` are called).

**Step 2: Update input hint for mode**

- Extend `inputHint` to accept an optional third argument: `splitEntryMode?: 'cumulative' | 'segment'`.
- When `metric.inputStructure === "cumulative"` and `splitEntryMode === 'segment'`, return a string like: `e.g. 0.95|0.90|0.80 (segment times, ${n} values, ${metric.inputUnits})` using the same `n` and splitsStr as current logic. When cumulative, keep existing hint text.
- Pass `splitEntryMode` into every `inputHint(...)` call in the form (placeholder and the `<p className="mt-1 text-xs ...">` hint).

**Step 3: Convert on submit when Segment**

In `submitEntry()`:
- When `showMobileSplits` and `splitEntryMode === 'segment'`: build string from `splitValues` as now (`splitValues.map((v) => v.trim()).join("|")`), then call `segmentInputToCumulativeInput(str)`. If result is `null`, set error to "Enter numbers for each segment" and return without calling fetch. Otherwise set `rawToSend = result`.
- When `showMobileSplits` and `splitEntryMode === 'cumulative'`, keep current behavior: `rawToSend = splitValues.map((v) => v.trim()).join("|")`.
- When not `showMobileSplits`, keep current behavior: `rawToSend = rawInput.trim()`.
- Add import: `import { segmentInputToCumulativeInput } from "@/lib/parser";`

**Step 4: Manual check**

Run dev server, select a session with a cumulative metric and splits, toggle to Segment, enter e.g. 0.95, 0.90, 0.80 in the three inputs, submit. Confirm entry is stored and leaderboard shows correct cumulative-based times. Toggle Cumulative, enter 0.95|1.85|2.65, submit; confirm same stored result.

**Step 5: Commit**

```bash
git add src/app/data-entry/EntryForm.tsx
git commit -m "feat(data-entry): add cumulative/segment toggle and convert segment on submit"
```

---

## Task 3: EditSessionClient — toggle for raw re-parse of cumulative entries

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`

**Step 1: Add state and detect cumulative metric**

- Add state: `const [editSplitEntryMode, setEditSplitEntryMode] = useState<'cumulative' | 'segment'>('cumulative');`
- When opening edit (e.g. in `openEdit`), set `setEditSplitEntryMode('cumulative')`.
- Add a derived boolean: the entry being edited is cumulative if `metricOptions.find((m) => m.key === editingEntry?.metric_key)?.input_structure === 'cumulative'`. Use this to decide whether to show the toggle.

**Step 2: Show toggle when raw mode and cumulative metric**

- In the edit modal, when `editMode === "raw"` and the current entry’s metric is cumulative, render the same "Cumulative" | "Segment" control above the raw input field (reuse same styling idea as EntryForm).

**Step 3: Convert on save when Segment**

- In `handleEditSave()`, when `editMode === "raw"` and the entry’s metric is cumulative and `editSplitEntryMode === 'segment'`: set `rawToSend = segmentInputToCumulativeInput(editRawInput.trim())`. If `rawToSend === null`, set `setEditError("Enter numbers for each segment")` and return. Otherwise send `body = { raw_input: rawToSend }`. When cumulative or non-cumulative, keep existing body construction.
- Add import: `import { segmentInputToCumulativeInput } from "@/lib/parser";`

**Step 4: Manual check**

Edit an existing cumulative entry, switch to "Segment", paste 0.95|0.90|0.80, save. Confirm the entry updates and stored raw_input is cumulative. Re-open edit and confirm raw input shows cumulative values.

**Step 5: Commit**

```bash
git add src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat(edit-session): add cumulative/segment toggle for raw re-parse of cumulative entries"
```

---

## Task 4: Lint and full test run

**Files:** None (verification only).

**Step 1: Lint**

Run: `npm run lint`
Expected: No new errors. Fix any that appear in modified files.

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass, including `parser.test.ts`.

**Step 3: Commit (if any lint fixes)**

If you had to fix lint: `git add <files>` and `git commit -m "chore: lint fixes for split-segment toggle"`.

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Parser: `segmentToCumulative`, `segmentInputToCumulativeInput` + Vitest tests |
| 2 | EntryForm: toggle state, UI, hint by mode, convert segment → cumulative on submit with validation |
| 3 | EditSessionClient: toggle in raw mode for cumulative metric, convert on save |
| 4 | Lint and full test run |

No API or schema changes. Storage remains cumulative-only.
