# F2F Slow-End Extrapolation — Design

**Date:** 2026-09-04  
**Status:** Validated  
**Companion:** [2026-09-03-force-to-form-design.md](./2026-09-03-force-to-form-design.md) · [2026-09-04-f2f-slow-end-extrapolation-implementation.md](./2026-09-04-f2f-slow-end-extrapolation-implementation.md)

**Goal:** Developmental athletes whose marks sit slower than the imported XPE floor still get a Force-to-Form **shape** that shows which quality is holding them back. Women get the same deficiency labels from that shape. Per-quality predicted 40s stay male-only.

This supersedes two v1 decisions: “outside table range → clamp” (slow side only) and “girls: triangle only, no labels, excluded from themes.”

---

## 1. Decisions and success criteria

Locked in brainstorming (2026-09-04):

| Topic | Decision |
|--------|----------|
| Fit | **Method 1:** runtime OLS in the lookup. Imported JSON rows stay the stick inside the table |
| Tail | OLS on the **slowest third** of each series (highest predicted 40s), at least three points when the table is long enough |
| Direction | Extrapolate **slower only**. Fast end still clamps to the last published row |
| Who | Same lookup for **all genders**. Developmental men get a real shape too |
| Engine | Still computes Explosion / Force / Form predicted 40s for everyone (triangle + 3–4% band) |
| Labels | Men **and** women, when two or more qualities and a reference exist. Unknown gender stays unlabeled |
| Predicted 40s on screen | **Male only** (`show_predicted_40s`). Women: chips + triangle; omit Explosion / Force / Form 40s (not `—`) |
| Ref 40 | Show for men. Hide for women so a football-norm or extrapolated 40 is not the takeaway. Matrix still has the real 40 |
| Themes | Women now count in sport · gender mix / top 3 / top 5 |
| Athlete PDF | Focus badge follows `eligible_for_labels` (women included). Still no per-quality 40s |

**Success criteria**

- A woman whose fly / jump predicts slower than the XPE floor (~5.5–5.7) gets a non-flat triangle and a primary chip (`Force-deficient`, etc.).
- Two qualities that are unequally “too slow” plot at different radii. Clamping them to the same edge value is a bug.
- Men still see Ref 40 and three predicted 40s. Women do not see those quality 40s or Ref 40.
- A mark inside the table still interpolates between neighboring rows (no regression inside the stick).
- A mark faster than the table still clamps and is marked `extrapolated`.

**Out of scope**

- A separate female XPE workbook
- Extrapolating the fast / elite end
- Treating extrapolated predicted 40s as real combine times
- Coach-editable table rows

---

## 2. Lookup

`interpolatePredicted40` still interpolates between neighboring rows when `x` is inside the table.

**Slow edge** = the endpoint whose `y` (predicted 40) is higher. That is the short-jump / slow-time / low-mph side. The other end is fast.

On module load, each series used by resolve (broad distance, Force time, Force mph, each Form mph table) sorts by predicted 40 descending and takes the slowest third (`max(2, ceil(n / 3))`, prefer 3+ when `n` allows). Ordinary least squares: `predicted_40 = intercept + slope * x`. Cache the fit next to the points.

If `x` is past the slow end, evaluate the line and set `extrapolated: true`. If `x` is past the fast end, clamp to the last published row (`extrapolated: true`), unchanged.

**Guards** (fall back to today’s clamp):

- Fewer than two tail points
- Slope that would make a slower mark predict a *faster* 40
- Non-finite intercept, slope, or result

Predicted 40s may read past ~5.7. Those numbers exist for **shape and labels**, not as a combine claim. `vertexRadius` already maps predicted 40 against reference ±10%, so a slower quality pulls toward center.

Do not pre-extend the JSON tables. Do not fit OLS on every resolve call.

---

## 3. Profile and display

Add `show_predicted_40s: boolean` on `F2fProfile` (`true` only when `gender === "M"`).

`eligible_for_labels` is no longer male-only. It is true when gender is `M` or `F`, there are at least two qualities, and a finite reference 40 exists. Classify with the same `DEFICIENCY_BAND = 0.035`.

| Surface | Men | Women |
|---------|-----|--------|
| Testing-day strip | Chips, Ref 40, three predicted 40s, triangle | Chips + triangle only |
| Athlete page | Same as strip | Chips + triangle only |
| Coach PDF | Labels + predicted 40 columns | Labels; omit the three 40 columns (and Ref 40) |
| Athlete PDF | Focus badge if labeled; no lecture table of 40s | Same, now that they can be labeled |
| Themes | Counted | Counted |

UI must omit the predicted-40 block when `show_predicted_40s` is false — do not render `—` for Explosion / Force / Form. Payload may still include the vertices; clients key off the flag.

---

## 4. Gaps, errors, tests

| Situation | Behavior |
|-----------|----------|
| Inside table | Neighbor interpolation; `extrapolated: false` |
| Past slow edge | Tail OLS; `extrapolated: true` |
| Past fast edge | Clamp last row; `extrapolated: true` |
| Bad / reversed slope | Clamp |
| Woman, 2+ qualities | Labels + triangle; `show_predicted_40s: false` |
| Unknown gender | Shape if marks exist; no labels; no predicted-40 display |
| One quality | Vertex + shape; `primary` null |

**Tests (pure, `src/lib/norms/f2f/`)**

- Tail OLS: a mark slower than the Force / Form / broad floor continues the slow-third slope; not equal to the edge row.
- Fast side still clamps.
- In-table interpolation unchanged (existing resolve-mark cases still pass).
- Wrong-sign slope guard clamps.
- Woman with an off-table Force and a stronger Explosion: `primary === "force"`, `eligible_for_labels`, `show_predicted_40s === false`.
- Man with the same marks: same primary, `show_predicted_40s === true`.
- Themes: a labeled woman is in `eligible_count` / mix.
- Strip / athlete / PDF helpers hide Ref 40 and quality 40s when `show_predicted_40s` is false.

---

## 5. Implementation order

1. Slow-tail OLS + guards in `lookup.ts`; fit cached from `tables.ts`. Tests first.
2. `show_predicted_40s` + female labels in `buildF2fProfile`. Update profile / board / theme tests.
3. Testing-day strip, athlete `F2fSection`, coach PDF: gate the 40 numerals on the flag.

Ready for an implementation plan in the existing `feature/force-to-form` worktree.
