# F2F 20yd Form Proxy and Reference — Design

**Date:** 2026-09-04  
**Status:** Validated  
**Companion:** [2026-09-03-force-to-form-design.md](./2026-09-03-force-to-form-design.md)

**Goal:** On a 20yd day, Form and the triangle reference come from the 40yd segment table, not from treating a 10–20 as top-end or averaging Villani Force/Form lookups.

Source table: `40yd-Segment_Table.csv` (imported as `src/lib/norms/f2f/tables/40yd-segments.json`). Range 4.10–5.45. Fits are OLS on the **whole** table and are used past the table edges.

This supersedes: Form fallback “10–20 mph on the combined Form curve”; sprint-anchored reference “median of Force + Form predicted 40s” when a 20yd (or 10–20) exists; triangle pads of 10% / 15%.

---

## 1. Locked decisions

| Topic | Decision |
|---|---|
| Form proxy | `t_20_30 = t_10_20 − 0.10`, then Villani **20–30** table. `projected: true` |
| Reference (no actual 40) | `0-20yd` OLS first; else `40 = 5 × t_10_20 − 0.80`; else median of Force + Form |
| Actual `0-40yd` | Still wins |
| Explosion | Still excluded from the reference |
| Missing Form | Still copied onto the reference (not onto Force) |
| Outer pad | **12.5%** faster than the reference |
| Origin | **12.5%** slower than the reference |
| Force | Unchanged (5–15 reconstruct, etc.) |

---

## 2. Segment-table fits

Whole-table OLS (R² = 1 for 20–30 and for 40 from 10–20; R² = 0.998 for 40 from 0–20):

- `20-30 = 10-20 − 0.10`
- `40 = 1.8678 × t_0_20 − 0.4163`
- `40 = 5 × t_10_20 − 0.80`

Do not double the 20yd. The second 20 is ~0.70–0.81s faster than the first.

Past the CSV (volleyball 10–20 of 1.28–1.50, 0–20 of 3.3+): evaluate the same lines. Villani slow-end OLS still applies to the resulting 20–30 time if it is slower than the 20–30 floor.

If `t_10_20 ≤ 0.10`, the 20–30 estimate is non-positive: skip the proxy (Form missing / copy onto reference).

---

## 3. Profile ladder

**Form**

1. Exact `20-40yd` / `30-40yd` / `20-30yd` (unchanged).
2. Else 10–20 (timed or derived from 0–10 / 0–20) → `t − 0.10` → `resolveForm({ component: "20-30yd" })`. Input shows `20-30yd` and the estimated time, like Force’s reconstructed 5–15.
3. Else absent, then copy onto the reference when Force (or a reference) exists.

**Reference**

1. Actual `0-40yd`.
2. Else timed `0-20yd` → 0–20 OLS.
3. Else timed/derived `10-20yd` → `5 × t − 0.80`.
4. Else median of Force + Form predicted 40s.

`reference_source` is `actual_40` or `projected`.

---

## 4. Triangle

- Origin: reference × 1.125  
- Outer rim: reference × 0.875  
- Equal-to-reference is radius 0.5 again (symmetric ±12.5%).

Deficiency band stays 3.5% vs the reference.
