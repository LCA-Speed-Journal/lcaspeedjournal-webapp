# Design: Canonical metric keys for 0-start cumulative splits

**Date:** 2026-03-20  
**Project:** `lcaspeedjournal-webapp-clean`  
**Decision:** Emit canonical `metric_key` in the parser (Approach 1); **backfill existing `entries`** (Option A).

## 1. Problem and goals

### Problem

For cumulative speed metrics (e.g. `20m_Accel` with gates at 0, 5, 10, 20), `parseCumulative` emits multiple rows that share the **parent** `metric_key` (`20m_Accel`) and distinguish segments via `component` (`0-5m`, `0-10m`, `0-20m`). Leaderboards and PR aggregation are keyed by `metric_key`; PRs use `getPrimaryComponent` to keep only the full-run component (`0-20m`), so **intermediate 0-start times never appear** under `5m_Accel` / `10m_Accel` / `30m_Accel` as first-class metrics.

### Goals

- Store each **0 → Xm** cumulative time under the **canonical registry key** for that distance and event family (e.g. `5m_Accel`, `10m_Accel`, `30m_Accel`), whether the coach entered a `20m_Accel`, `40m_Accel`, or `50m_Accel` rep—**when** a matching metric exists in `metrics.json`.
- Enable comparison on leaderboards, historical/progression views, and athlete PRs **by metric** without relying on `component` filters for those rows.
- **Migrate existing rows** in `entries` so history matches new behavior.

### Non-goals

- Changing how coaches pick the **session metric** in data entry (still e.g. `20m_Accel` + raw pipe input).
- Redefining non-zero split rows (`5-10m`, `10-20m`, velocity splits) beyond what already maps to dedicated keys (`5-10m_Split`, etc.).

---

## 2. Current behavior (reference)

- **Parser:** `src/lib/parser.ts` — `parseCumulative` builds cumulative rows with `metric_key = parent.display_name`, `component = formatIntervalLabel(0, endM)` for the first loop.
- **PRs:** `src/app/api/athletes/[id]/prs/route.ts` — filters to `getPrimaryComponent(metric_key)` or `component == null`, so only the “full run” row counts for cumulative parents.
- **Leaderboard:** `src/app/api/leaderboard/route.ts` — filters by `metric_key` and optional `component` / `interval_index`.

---

## 3. Canonical resolution

### Rule

For a **parent** cumulative metric whose key matches:

`^(\d+)m_(.+)$` → capture `declaredMeters` and `suffix` (e.g. `20`, `Accel`; `40`, `Sprint`; `20`, `Light-Sled`).

For a row representing **time from 0 to endM** with `component` matching `^0-(\d+)m$` (or equivalent from `formatIntervalLabel`):

1. Build candidate key: **`${endM}m_${suffix}`** (e.g. `30m_Accel`, `10m_Light-Sled`).
2. If `registry[candidate]` **exists**, use it as **`metric_key`** for that row.
3. Set **`component`** to match PR/leaderboard expectations:
   - If the canonical metric is **cumulative**, set `component` to **`getPrimaryComponent(candidate)`** (e.g. `0-10m` for `10m_Accel`) so existing PR logic keeps exactly one row per rep for that key.
   - If the canonical metric is **single_interval** (e.g. `5m_Accel`), set **`component` to `null`** (matches current `parseSingleInterval` and PR filter `primary == null`).
4. Set **`interval_index`** to **`null`** for these canonicalized rows (avoids ambiguity with old index-based leaderboard filters).
5. If the candidate key **does not exist**, **leave** `metric_key` and `component` as today (no data loss; document registry gaps).

### Families covered

Same suffix is preserved: `Accel`, `Sprint`, `Light-Sled`, `Medium-Sled`, and any future `^\d+m_<suffix>` cumulative metrics that have a matching `Xm_<suffix>` key for each needed distance.

### Registry gaps (explicit)

- **`Sprint`:** Only `40m_Sprint` and `50m_Sprint` exist. Segments like `0-20m` or `0-30m` from a `50m_Sprint` rep have **no** `20m_Sprint` / `30m_Sprint` keys today—those rows **stay** `50m_Sprint` + `0-20m` until new metrics are added.
- **Lactic / non-`Nm_<suffix>` keys** (e.g. `24/28_200m`, `3x200m`): Parent key does not match `^\d+m_`; **do not** canonicalize (parser and migration skip).

### Overlap rows (nested intervals)

The parser’s third loop adds **non-adjacent** intervals (e.g. `10-30m`) with the parent `metric_key`. Those are **not** 0-start cumulative rows; **do not** remap them to `30m_Accel` (different interval). Only the **first loop** rows where the interval is **`0` → `endM`** (first segment of cumulative stack) get canonical keys. Review the third loop for double-counting vs canonical `30m_Accel` after this change; tests should assert one stored row per logical 0–30m time.

---

## 4. Parser implementation

- Add **`resolveCanonicalZeroStartMetric(parentKey, endM, registry): { metric_key, component } | null`** in `metric-utils.ts` (or `parser.ts` if preferred), implementing §3.
- In **`parseCumulative`**, for the **first** `for` loop only (0–5, 0–10, …), replace `metric_key: metric.display_name` with the resolved canonical `metric_key` and `component` from the helper; fall back to current behavior when resolution returns null.
- Re-run **`applyConversion`** using the **canonical** metric’s `conversion_formula` if it can differ from the parent (today usually identical for time-in-s; confirm for velocity).
- Update **`parser.test.ts`** with cases: `20m_Accel` input → rows for `5m_Accel`, `10m_Accel`, `20m_Accel` with correct `value` / `display_value` / `component`.

---

## 5. `metric-utils` and PR API

- **`getPrimaryComponent`:** Remains valid for cumulative canonical keys; canonical rows should use `component === getPrimaryComponent(canonicalKey)` where applicable.
- **`prs/route.ts`:** After canonical storage, intermediate segments are no longer filtered as “non-primary” under a single parent key. **Verify** no double-counting if both an old-style row and a canonical row could exist post-migration (migration should **update** in place, not duplicate).
- **`formatEntryMetricLabel`:** May show cleaner labels when `metric_key` is already `10m_Accel` and `component` is `0-10m` or null—optional UX tweak later.

---

## 6. Leaderboard, historical, progression

- **Leaderboard:** Requests that used `metric=20m_Accel&component=0-5m` must switch to **`metric=5m_Accel`** (and default component). Update **`LeaderboardClient.tsx`** / metric picker options so each canonical metric is a first-class tab or option.
- **Historical / progression APIs:** Any query that grouped by parent `metric_key` + `component` for 0-start splits should query **`metric_key` only** for those metrics (`src/app/api/progression/route.ts`, `api/leaderboard/historical/route.ts`). Grep for `component` + cumulative patterns and adjust.

---

## 7. Backfill migration (Option A)

- **Script:** Add `scripts/migrate-canonical-cumulative-zero-start.sql` (or a small Node script using the same `resolveCanonical*` logic as the parser to avoid drift).
- **Scope:** `UPDATE entries` where:
  - `metric_key` matches `^\d+m_.+` and exists in registry as cumulative **parent** (or match list used in parser), and
  - `component` ~ `^0-\d+m$`, and
  - Resolved canonical key ≠ current `metric_key` (idempotent: running twice is safe).
- **Set** `metric_key`, `component`, `interval_index` per §3.
- **Safety:** Run in a transaction; dry-run `SELECT` counts before/after; backup recommended (same pattern as `migrate-normalize-jump-units-to-ft.sql`).
- **Verification queries:** Per-metric counts; spot-check a few sessions in UI (leaderboard + PRs + data entry list).

---

## 8. Error handling and invariants

- If resolution fails, **preserve** current row shape.
- **Unique constraint:** None on `(session_id, athlete_id, metric_key, component)` today—canonicalization might increase distinct `metric_key` rows per rep without duplicating the same logical mark if migration is correct.

---

## 9. Testing checklist

| Area | Tests |
|------|--------|
| Parser | Golden cases for `20m_Accel`, `30m_Accel`, `50m_Sprint` (gap), `20m_Light-Sled` |
| metric-utils | Resolution + primary component alignment |
| PR API | Best time per `5m_Accel` / `10m_Accel` includes splits from longer reps |
| Leaderboard | `metric=5m_Accel` returns expected athletes without legacy `component` param |
| Migration | Idempotent SQL or script test on a copy |

---

## 10. Rollout order

1. Implement `resolveCanonicalZeroStartMetric` + parser changes + unit tests.
2. Run migration on staging DB; verify.
3. Update leaderboard/historical UI and API consumers.
4. Deploy app + run production migration in a maintenance window if needed.

---

## 11. Follow-up (optional)

- Add missing **`Nm_Sprint`** keys for common gate distances if you want full cross-rep comparison for fly-in sprints.
- Optional **`raw_input` / provenance** column later if you need “entered as `50m_Sprint`” on each row (not required for v1).
