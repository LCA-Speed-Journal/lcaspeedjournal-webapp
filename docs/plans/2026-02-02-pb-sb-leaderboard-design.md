# PB/SB Leaderboard Badge — Design

**Date:** 2026-02-02  
**Goal:** On the Live leaderboard, show per-card whether the displayed mark is a Personal Best (PB) or Season Best (SB). One badge per card (bottom-left); PB takes precedence over SB. Season = calendar year of the current session.

---

## 1. Overview and logic

**Scope:** Live leaderboard only (`/leaderboard`). Each leaderboard card can show at most one of **PB** or **SB** in the bottom-left. Session-to-session comparison stays in the bottom-right.

**Definitions:**
- **Personal Best (PB):** The athlete’s **all-time** best for this metric (and, when viewing a component leaderboard, the same `interval_index` / `component`). The card’s `display_value` equals that all-time best.
- **Season Best (SB):** The athlete’s best in the **calendar year** of the current session. Same metric (and component when applicable). The card’s `display_value` equals that season best. We only show SB when it’s **not** also a PB (so no “PB · SB”; if it’s a PB we show PB only).

**Comparison scope:** Same as the improvement indicator — per metric, and when the leaderboard is filtered by component (e.g. “Split 1”), PB/SB is scoped to that component. Time metrics: best = minimum `display_value`. Distance/speed: best = maximum.

**Season:** “Season” = calendar year of the current session’s `session_date` (e.g. session on 2025-02-15 → season 2025-01-01 to 2025-12-31).

**No badge:** If the mark is neither a PB nor an SB, show nothing in the bottom-left.

---

## 2. API and data shape

**Approach:** Extend **GET /api/leaderboard** so each row can include a PB/SB flag. Same request returns ranks, session-to-session comparison (existing), and PB/SB when applicable.

**LeaderboardRow extension** (in `src/types/index.ts`):
- `best_type?: "pb" | "sb"` — present when the row’s `display_value` is a personal best or (only when not a PB) a season best for that athlete + metric (+ component when filtered). Omit when neither.

**API behavior:** For each athlete in the current-session leaderboard:
1. **PB:** Compare `display_value` to the athlete’s all-time best for the same metric (and same `interval_index`/`component`) across all sessions. Time: MIN; distance/speed: MAX. If current equals that best → `best_type: "pb"` and skip SB.
2. **SB:** Only when not a PB. Calendar year of current session’s `session_date`. Compare current value to the athlete’s best in that year for the same metric (and component). If current equals that season best → `best_type: "sb"`.

**Performance:** Bulk queries keyed by `(athlete_id, metric_key, interval_index?, component?)`; map results onto each row. Avoid N+1.

**Component / interval:** When the leaderboard is filtered by `interval_index` and/or `component`, PB and SB use the same filter.

---

## 3. UI: badge placement, styling, accessibility

**Placement:** One small badge in the **bottom-left** of each leaderboard card. Session-to-session pill stays **bottom-right**. Bottom row: flex row, PB/SB left, pill right when both exist.

**Badge content:** Text only: **"PB"** or **"SB"**. Optional tooltip: "Personal best" or "Season best 2025" for SB.

**Styling:** Small pill: `text-xs`, padding `px-2 py-0.5`, rounded. **PB:** gold/amber (e.g. `bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50`). **SB:** muted (e.g. `bg-foreground-muted/20 text-foreground-muted border border-border`).

**Accessibility:** `aria-label` on the badge: "Personal best" or "Season best".

---

## 4. Error handling and edge cases

- **No PB/SB:** Omit `best_type`; no badge.
- **First-ever mark:** Show **PB**.
- **First mark of the year:** Show **SB** (or **PB** if also all-time best).
- **Floating-point:** Compare with same precision as stored; use epsilon if needed.
- **Metric type:** Time = MIN; distance/speed = MAX (same as leaderboard/PRs).
- **API failure:** Omit `best_type` on failure so the rest of the leaderboard still works.

---

## 5. Testing and verification

- **API:** GET leaderboard; rows with PB have `best_type: "pb"`, rows with SB-only have `best_type: "sb"`, others have no `best_type`.
- **UI:** PB badge bottom-left (gold/amber); SB badge bottom-left (muted). Improvement pill bottom-right unchanged. Layout: bottom row with badge left, pill right when both exist.
- **Edge cases:** First-ever mark → PB. First mark of year (not PB) → SB. Component leaderboard: PB/SB scoped to that component.

---

## Summary

| Decision | Choice |
|----------|--------|
| Season | Calendar year of current session |
| Badge when both PB and SB | Show PB only |
| Placement | Bottom-left of card |
| API | Extend GET /api/leaderboard with optional `best_type` per row |
