# Session-to-Session Leaderboard Comparison

**Date:** 2026-02-02  
**Goal:** On the Live leaderboard, show per-athlete session-to-session comparison: a small pill on the right side of each card with an arrow (up / neutral / down) and percent difference vs the athlete’s previous session for that metric, so athletes see if they’re improving, flat, or regressing.

---

## 1. Overview and Comparison Logic

**Scope:** Live leaderboard only (`/leaderboard`). Each leaderboard card can show a comparison vs the athlete’s **previous session** for the same metric (and same component when viewing a component leaderboard, e.g. “Split 1”).

**“Previous” mark:** For each leaderboard row we take that athlete’s **best value in the most recent prior session** where they have at least one entry for the **same metric** (and same `interval_index` / `component` when the leaderboard is filtered to a component). Session order is by `session_date` descending before the current session.

**Percent difference:**  
`((current_best - previous_best) / previous_best) * 100`.

- **Time metrics** (lower is better): negative percent = improvement → **up** arrow, green.
- **Distance/speed metrics** (higher is better): positive percent = improvement → **up** arrow, green.

So “up” always means “better than last time,” “down” means “worse.” For time metrics we display the improvement as a positive “faster” (e.g. “↑ 1.2%” = 1.2% faster).

**Neutral band (fixed, metric-aware):**

- **Time metrics:** ±**0.8%** → neutral (muted).
- **Distance/speed:** ±**1.5%** → neutral (muted).

Outside the band: improvement → up + green, regression → down + red.

**No previous session:** When an athlete has no prior session for that metric (and component), we show nothing (no pill).

---

## 2. API and Data Shape

**Approach:** Extend the existing **GET /api/leaderboard** response so each row can include optional session-to-session comparison data. No new endpoint; one request returns current ranks plus comparison when a previous mark exists.

**LeaderboardRow extension** (in `src/types/index.ts`):

- `previous_display_value?: number` — best value for this athlete+metric (and component) in the most recent prior session.
- `previous_session_date?: string` — date of that session (e.g. `"2025-01-15"`) for optional tooltip.
- `percent_change?: number` — signed percent vs previous (e.g. `2.3` or `-1.1`). API computes this so the UI doesn’t need to.
- `trend?: "up" | "neutral" | "down"` — derived from percent_change and metric type (time vs distance/speed) using the 0.8% / 1.5% bands.

**API behavior:** For each athlete in the current-session leaderboard, after resolving their best value for the requested metric (and interval_index/component), find the most recent session *before* the current session where that athlete has at least one entry for the same metric (and same interval_index/component). Take the best `display_value` in that session. If none exists, leave the new fields undefined. Compute `percent_change` as `((current - previous) / previous) * 100`. For time metrics, improvement = negative percent; for distance/speed, positive. Set `trend`: within ±0.8% (time) or ±1.5% (distance/speed) → `"neutral"`; else improvement → `"up"`, regression → `"down"`.

**Performance:** Reuse existing indexes (`session_id`, `metric_key`, etc.). The “previous session” lookup is per athlete and can be done in the same SQL (e.g. LATERAL join or correlated subquery) so we avoid N+1 round-trips.

**Zero previous value:** If `previous_display_value` is 0 (e.g. distance), do not set `percent_change` or `trend`; UI shows no pill.

---

## 3. UI: Pill Placement, Formatting, and Colors

**Placement:** Small pill/badge on the **bottom-right** of each leaderboard card. Rank stays top-right; the comparison is clearly secondary (e.g. flex layout that pushes the pill to the bottom-right).

**Pill structure:** Small pill: padding (e.g. `px-2 py-0.5` or `py-1`), rounded (e.g. `rounded-full` or `rounded-md`), `text-xs` (or `text-sm`), `font-mono` for the percent. Content: **arrow + percent** — e.g. `↑ 2.3%`, `→` (or `−`) for neutral, `↓ 1.1%`. No “vs last” in the label; optional tooltip can show `previous_session_date` (e.g. “vs 15 Jan 2025”).

**Percent display:** One decimal when useful (e.g. `2.3%`, `-1.1%`). For **time metrics**, improvement = faster = negative raw percent; show as positive “improvement” in the pill (e.g. “↑ 1.2%” = 1.2% faster). Use API’s `trend` for arrow and color; use `percent_change` for the numeric part (with sign or abs as above).

**Colors (semantic):**

- **up** (improvement): green tint — e.g. `bg-success/20 text-success border border-success/50` (or equivalent if `success` not in theme; add minimal semantic classes).
- **neutral:** muted — e.g. `bg-foreground-muted/15 text-foreground-muted border border-border`.
- **down** (regression): red/danger — e.g. `bg-danger/20 text-danger border border-danger/50`.

**Responsive:** Pill stays one line (arrow + one decimal). On narrow cards, prefer not truncating the percent.

**Accessibility:** Optional `aria-label` on the pill, e.g. “2.3% better than last session.”

---

## 4. Error Handling and Edge Cases

- **No previous session:** Omit new fields; UI shows no pill.
- **Previous session has no matching component:** When filtering by interval_index/component, “previous” is the last session where the athlete had that same component. If they never did that component before, treat as no previous mark — no pill.
- **Zero or invalid previous value:** API does not set `percent_change` or `trend`; UI shows no pill.
- **Current session updates:** As new entries are added, leaderboard refetches (SWR). Current best can change; “previous” is fixed. Pill updates when current mark (and thus percent_change and trend) changes.
- **API failure:** Existing behavior (retry, error message). No separate “comparison failed” state.
- **Metric type for thresholds:** Time vs distance/speed from registry (e.g. `display_units === "s"` → time). Synthetic metrics use same rule from their units. Unknown type defaults to distance/speed band (±1.5%).
- **Rounding:** Percent change rounded to one decimal; trend uses same value against the band.

---

## 5. Testing and Verification

- **API:** Call `GET /api/leaderboard?session_id=...&metric=...` (and optional interval_index/component). For athletes with a prior session for that metric, response rows include `previous_display_value`, `previous_session_date`, `percent_change`, `trend`. For athletes with no prior session, those fields are absent. Verify percent_change and trend for known current/previous pairs (time and distance/speed).
- **UI:** On Live leaderboard, select a session and expand a metric. Cards with comparison show the pill bottom-right with correct arrow and color (up=green, neutral=muted, down=red). Cards without comparison show no pill. Add/update entries in current session; leaderboard refreshes and pill updates when current best changes.
- **Edge cases:** Athlete with previous_display_value = 0 → no pill. Time metric: improvement shows up arrow + positive “faster” percent. Distance/speed: improvement shows up arrow + positive percent.

---

## Summary

| Decision | Choice |
|----------|--------|
| Neutral threshold (time) | ±0.8% |
| Neutral threshold (distance/speed) | ±1.5% |
| No previous mark | Show nothing |
| Pill placement | Bottom-right of card |
| Pill content | Arrow + percent; semantic color (green / muted / red) |
| API | Extend GET /api/leaderboard with optional previous_*, percent_change, trend per row |
