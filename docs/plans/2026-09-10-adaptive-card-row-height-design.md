# Adaptive Weight-Room Card Row Height — Design

**Date:** 2026-09-10  
**Status:** Validated  
**Companion:** [2026-08-24-hugo-workout-card-intake-design.md](./2026-08-24-hugo-workout-card-intake-design.md) · [2026-09-10-adaptive-card-row-height-implementation.md](./2026-09-10-adaptive-card-row-height-implementation.md)

**Goal:** Printed workout cards use one shared density function so row heights breathe on short sessions and shrink on dense ones (15+ exercises), within inch caps that stay writable and scan-readable.

This is **not** a new scan pipeline. Upload, QR, and vision stay as they are. The change is that estimate, preview, print, and PDF screenshot all obey the same applied heights.

---

## 1. Decisions

Locked in brainstorming (2026-09-10):

| Topic | Decision |
|--------|----------|
| Approach | **Method 1:** one `computeCardRowHeights(draft)` + CSS variables on `.wr-sheet` |
| Scan-safe | **Decision A:** if the card fits at or above the mins, it is scan-safe (no 12-movement cap) |
| Fillable (Load×Reps) | Min `3/16"`, ideal `5/16"`, max `7/16"` |
| Notes | Min `1/8"`, ideal `3/16"`, max `1/4"` |
| Zero-set (warmup / cue block) | Min `1/4"`, ideal `5/16"`, max `3/8"` — same scale rule, not a fixed `0.40"` |
| Grow leftover | Fillable first, then zero-set, then notes; stop at each type’s max |
| Shrink | One shared factor toward each type’s own min |
| Short cards | Hit max caps and leave white paper so fiducials stay in the page corners |
| Print when crowded | Still available; existing “check the preview” warning |
| Wrap / tall `exerciseHtml` | Not measured. Height is the paper contract; overflow is an editor content problem |
| Fiducial deskew / PDF upload | Out of scope |

**Success criteria**

- A 4-exercise card does not grow past `7/16"` fillable / `3/8"` zero-set / `1/4"` notes. Extra space is empty paper at the bottom of the `7.8"` sheet.
- Leftover after ideal is spent up to the max caps (an 8-row card with notes on every row hits those caps). A pack whose ideal sum is close to `6.68"` (about 13 all-notes rows) sits near ideal.
- A 15-exercise card with notes shrinks toward mins, still fits one landscape letter page, and is **scan-safe**.
- Preview, editor badge, browser print, and `html-to-image` PDF show the same row heights.
- A 13-movement card is no longer “not scan-safe” only because it exceeds 12 rows.
- `maxSets > 6` is still not scan-safe.

**Out of scope**

- Per-row heights from wrapped names or `exerciseHtml`
- Discrete sparse/typical/dense bands
- Changing scan upload (still JPEG/PNG/WebP, max 4 MB, no PDF)
- Fiducial detection or deskew
- A second `@react-pdf/renderer` card layout
- Blocking print when height overflows (warning only, same as today)

---

## 2. Row types

Reuse the print view’s movement rules:

| Type | When | Height band |
|------|------|-------------|
| **Zero-set** | `setCount <= 0` (warmup cue block is the usual case) | `1/4"`–`3/8"` |
| **Fillable** | `setCount > 0` | `3/16"`–`7/16"` |
| **Notes** | Non-empty `notes` on a fillable movement (not on zero-set rows) | `1/8"`–`1/4"` |

A movement can contribute a fillable row plus a notes row. Zero-set movements are a single spanning row (today’s warmup layout).

Inch constants (export from the layout module):

```
FILL_ROW_MIN_IN   = 3/16 = 0.1875
FILL_ROW_IDEAL_IN = 5/16 = 0.3125
FILL_ROW_MAX_IN   = 7/16 = 0.4375

NOTES_ROW_MIN_IN   = 1/8  = 0.125
NOTES_ROW_IDEAL_IN = 3/16 = 0.1875
NOTES_ROW_MAX_IN   = 1/4  = 0.25

ZERO_SET_ROW_MIN_IN   = 1/4  = 0.25
ZERO_SET_ROW_IDEAL_IN = 5/16 = 0.3125
ZERO_SET_ROW_MAX_IN   = 3/8  = 0.375
```

Delete `MOVEMENT_ROW_IN = 0.28`, `NOTES_ROW_IN = 0.16`, `WARMUP_ROW_IN = 0.4`, `MIN_SCAN_ROW_IN = 0.26`, and `MAX_SCAN_SAFE_MOVEMENTS = 12` as live gates. `MAX_SCAN_SAFE_SETS = 6` stays.

Page budget is unchanged: `PAGE_BODY_IN = 7.8`, `HEADER_IN = 0.8`, `TABLE_HEAD_IN = 0.32`. Grid available = `6.68"`.

---

## 3. Density function

`computeCardRowHeights(draft)` returns:

```
{
  fillRowIn,
  notesRowIn,
  zeroSetRowIn,
  usedHeightIn,   // header + table head + sum of applied rows
  leftoverIn      // max(0, PAGE_BODY_IN - usedHeightIn)
}
```

Count `nFill`, `nNotes`, `nZero` from the draft. Empty draft: return ideals; `usedHeightIn` is just header + table head. No divide-by-zero.

**Ideal pack**

`idealSum = nFill * fillIdeal + nNotes * notesIdeal + nZero * zeroIdeal`

**If `idealSum <= available` (grow)**

Start each type at ideal. Spend leftover in order:

1. Fillable: add up to `fillMax − fillIdeal` per fillable row.
2. Zero-set: add up to `zeroMax − zeroIdeal` per zero-set row.
3. Notes: add up to `notesMax − notesIdeal` per notes row.

Any remainder stays leftover paper (`.wr-sheet` `min-height: 7.8in` keeps fiducials at the corners).

**If `idealSum > available` (shrink)**

`minSum = nFill * fillMin + nNotes * notesMin + nZero * zeroMin`

- If `minSum > available`: apply the three mins anyway (densest legal sheet), `fits = false`.
- Else one shared `t = (idealSum − available) / (idealSum − minSum)` in `[0, 1]`.  
  `height = ideal + t * (min − ideal)` for each type. That fills the page exactly at the shared factor.

Do not grow one type while shrinking another. Do not give leftover to a type that is already at max.

With these mins, ~20 all-notes dummy rows still **fit** (min pack ≈ `6.25"`). Overflow begins when `minSum > 6.68"` (about **22** all-notes rows). Use that threshold in tests, not the old fixed-height “20 overflows” example.

---

## 4. Fit and scan-safe

`analyzeCardFit` calls `computeCardRowHeights` and sets:

- `estimatedHeightIn = usedHeightIn`
- `fits = usedHeightIn <= PAGE_BODY_IN` (equivalently: not in the “mins still overflow” branch)
- `scanSafe = fits && maxSets <= MAX_SCAN_SAFE_SETS`

No movement-count cap. No average `rowBudget >= 0.26"` check. Decision A: a 15-row card that fits at mins is scan-safe.

Warnings:

- Overflow → `Estimated Xin exceeds 7.8in page body` (or “overflows at minimum row heights”).
- `maxSets > 6` → same set-column warning as today.
- Drop “movements is above the scan-safe max of 12.”

`crowdingPrintWarning` is unchanged: print stays on; if not scan-safe, tell the coach to check the preview.

---

## 5. Render wiring

```
CardDraft
    → computeCardRowHeights
         ├─ analyzeCardFit  → editor badge, preview catalog
         └─ CardPrintView   → --wr-fill-row, --wr-notes-row, --wr-zero-set-row
                → card-print.css
                → browser print + html-to-image PDF
```

`CardPrintView` sets the three CSS variables in inches on `.wr-sheet`. CSS:

- Fillable result / target cells: `height: var(--wr-fill-row)` — remove `.wr-result { min-height: 1.55em }` and the extra vertical padding that fights the contract. Padding is inside the height.
- `.wr-notes td`: `height: var(--wr-notes-row)`
- Zero-set / warmup row: `height: var(--wr-zero-set-row)`

Keep `.wr-sheet { min-height: 7.8in }` and the three fiducials. Preview scale frame and print `@page` margins do not change.

Editor badge copy drops “12-movement cap.” Preview catalog hints for stress-14 / stress-16 that say “past the scan-safe cap” should describe shrink vs overflow instead.

---

## 6. Scan intersection (unchanged path)

1. Coach prints the HTML sheet (now with applied heights).
2. Athlete writes Load×Reps.
3. Coach uploads JPEG/PNG/WebP ≤ 4 MB (ADF: export pages in the scanner driver; phone: resize if needed).
4. QR decode (template + sticker). No deskew.
5. Vision reads the whole image against known `movementId:setIndex` keys.
6. Coach reviews and confirms.

Denser legal cards can make casual phone photos harder (`3/16"` is ~28–40 px at 150–200 dpi). ADF at 300 dpi is comfortable. Review stays the safety net. This work does not add geometry cropping or fiducial deskew.

---

## 7. Testing

Pure functions in `layout-estimate.test.ts` (or a sibling test if the height helper is split):

| Case | Expect |
|------|--------|
| 4 fillable + notes | Fillable at `7/16"`; notes at `1/4"`; leftover paper; `fits` + `scanSafe` |
| 8 fillable + notes on every row | Hits max caps (leftover grow), still `fits` + `scanSafe` |
| ~13 all-notes rows | Near ideal (`5/16"` / `3/16"`) |
| 15-row with notes | Shrink toward mins; `fits` and **scan-safe** |
| 24 dummy rows with notes | Overflow; not scan-safe (`minSum > 6.68"`) |
| One zero-set warmup + mains | Warmup uses the zero-set band, not `0.40"` |
| 13 movements, `maxSets ≤ 6`, height fits | Scan-safe (no movement-count fail) |
| `maxSets > 6` | Not scan-safe even if height fits |
| `estimatedHeightIn` | Equals header + table head + sum of applied row heights |

Update preview catalog strings that still treat 14 rows as past a hard scan cap.

---

## 8. YAGNI

- No per-exercise height from wrap or HTML line breaks.
- No new print-block besides today’s overflow warning.
- No scan-upload or vision prompt changes.
- No stored layout on `workout_templates` — heights are derived at render time from the draft.
