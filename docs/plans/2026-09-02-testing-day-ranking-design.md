# Testing-Day Ranking, Derived Sprint Columns, and Dual PDFs

**Date:** 2026-09-02  
**Goal:** Make the testing-day board scannable for coaches (ranked, point-scored), show the 20yd and Max Velocity that a sprint already contains, and produce two emailable PDFs — coach-complete and athlete-safe.

---

## 1. Decisions and Success Criteria

**Ranking**

- Places 1–8 score **10-8-7-6-4-3-2-1**. Place 9+ scores 0.
- Rank **within gender** (M and F separately). Unknown gender is a third pool so those athletes still appear without taking a men’s or women’s place.
- Same mark → same place and same points. The next athlete skips (two 1sts both get 10; the next is 3rd and gets 7).
- Per-cell rank is that gender rank (`2nd`, `T-1st` on a tie).

**Sprint family (one event)**

- Displayed columns: 40yd (primary `0-40yd`), 20yd, Max Velocity — when a source exists that day.
- 20yd cell = fastest of standalone `20yd_Dash` `0-20yd` or `40yd_Dash` `0-20yd`.
- Max Velocity cell = fastest mph of `40yd_Dash` `20-40yd` or `20yd_Dash` `10-20yd` (coach stick: 10 yd in 1.00 s → 20.45 mph).
- Sprint score = **average** of the 10-8-7-6-4-3-2-1 points from whichever of those three columns the athlete has. Other tests stay single scores.
- **Total = sprint average + each non-sprint test.** Athletes on a given day complete the same battery, so missing tests are not zero-filled.

**Row order**

1. Total descending  
2. 40yd gender rank (if that column exists)  
3. 20yd gender rank (if that column exists)  
4. Last name, first name, athlete id  

**PDFs**

- Real `@react-pdf/renderer` files (same pattern as weight-room reports), not browser print.
- **Coach PDF:** all badges, ranked matrix, sport · gender summaries.
- **Athlete PDF:** same matrix and totals; hide poor and developmental; omit the summary block. Efficient and better still show.

**Norms**

- Add synthetic `MaxVelocity` to the sport-defaults matrix and cuts editor (mph, higher is better, no component).
- Testing-day Max Velocity column zones against those cuts. 40yd / 20yd split cuts stay independent.

**Success criteria**

- Coach downloads two PDFs suitable as email attachments.
- One 40yd with 0–20 and 20–40 splits appears as 40 + 20 + Max V, but counts as one averaged sprint score.
- Athlete PDF never shows poor/developmental or the summary counts.
- Coaches can set Max Velocity mph cuts next to vertical, 40yd, and 20yd.

---

## 2. Board payload and columns

Extend `TestingDayBoardData` / matrix types in `src/lib/norms/testing-day.ts`. Ranking and derived columns are computed in that module (pure functions, unit-tested). The existing `GET /api/reporting/testing-day?session_id=` board response gains:

| Field | Role |
|-------|------|
| `columns[].kind` | `test` \| `derived_20yd` \| `derived_max_v` |
| `cell.rank` | 1-based gender rank, or null if no mark |
| `cell.tied` | true when at least one other athlete shares the mark |
| `cell.points` | 10/8/7/6/4/3/2/1/0 for that column |
| `athlete.sprint_points` | average of sprint-family column points the athlete has |
| `athlete.total_points` | sprint average + non-sprint column points |
| `athlete.rank_40` / `rank_20` | tie-break helpers (null if no column / no mark) |

**Column presence**

- Keep current primary-component columns for every metric that has entries (existing `NORMS_DEFAULTS_METRIC_KEYS` order, then extras).
- Add **20yd** when any athlete has standalone `20yd_Dash` `0-20yd` or `40yd_Dash` `0-20yd`. If a standalone 20yd column already exists, reuse it (do not duplicate); fill empty cells from 40 splits; best-of-day when both exist.
- Add **Max Velocity** after the sprint columns when any athlete has `40yd_Dash` `20-40yd` or `20yd_Dash` `10-20yd`.
- Always append **Total**.

**Zoning**

- 40yd / 20yd / other stored tests: existing `applyLeaderboardZones`.
- Max Velocity: `metric_key = MaxVelocity`, `component = null`, `lowerIsBetter = false`, mph display.

**On-screen board**

- Sort by the ranking model. Show mark + rank per cell; badges follow current coach rules (including poor/developmental).
- Browser print CSS may remain as a fallback; the product action is PDF download.

The date-range reporting CSV (`/api/reporting/export`) is unchanged. Ranks live on this board and the two PDFs.

---

## 3. PDF generation

Follow `src/lib/weight-room/report-pdf.tsx`: one document component, `renderToBuffer`, coach-auth route, `Content-Disposition: attachment`.

**Route**

`GET /api/reporting/testing-day/pdf?session_id=&audience=coach|athlete`  
Optional `population_id` matches the on-screen override.

**Document (`audience` flag)**

- Landscape letter, Helvetica, compact table.
- Header: “Testing-day summary”, session date, phase, “Coach” or “Athlete”.
- Shared body: ranked matrix (athlete, sport · gender, test columns, Total). Cell = mark + rank; zone label only when allowed for that audience.
- Coach only: poor/developmental badges; after the table, existing per-test sport · gender summaries (label counts, Efficient+, unbadged).
- Athlete: strip poor/developmental (reuse `isLiveLeaderboardZone` / `forPublicLeaderboard`); omit the summary block.

**Filenames**

`testing-day-<YYYY-MM-DD>-coach.pdf`  
`testing-day-<YYYY-MM-DD>-athlete.pdf`

**UI**

Two buttons on `/reporting/testing-day`: **Download coach PDF** and **Download athlete PDF**. Disabled until a session board is loaded.

---

## 4. Max Velocity norms

`MaxVelocity` remains synthetic (already used by progression, historical, and PRs). It is not an intake metric and is not added to `metrics.json`.

**Editor**

- Append `MaxVelocity` to `NORMS_DEFAULTS_METRIC_KEYS` (after `20yd_Dash` or at the end of the sprint pair).
- Include it in `cutsEditorMetrics()` (exception to the current “skip mph” filter).
- `defaultCutsComponent("MaxVelocity")` → `""`.
- Norms APIs accept `MaxVelocity` even though `isKnownMetricKey` today only checks `getMetricsRegistry()`. Treat the synthetic key as known for thresholds and sport defaults.

**Cuts**

- Overall mph, M/F grid, higher is better. No component picker.
- Sport-defaults matrix gets a Max Velocity column.

**Consumers this pass**

- Testing-day Max Velocity column only.
- Historical / PR Max Velocity charts may attach these zones later. 40yd `20-40yd` and 20yd `10-20yd` component cuts stay independent.

---

## 5. Error handling and tests

**Empty / partial days**

- No sprint sources → no 20yd/Max V columns; totals are the sum of conducted tests; tie-break falls through to name.
- Sprint column present but athlete missing a split → that factor is omitted from their sprint average (do not treat as 0).
- No entries → empty matrix, PDFs still download (header + “No entries”).

**Auth**

- Board and PDF routes stay coach PIN (`requireCoachSession`), same as today.

**Tests (vitest)**

- Gender-pool places and 10-8-7-6-4-3-2-1, including ties that skip a place.
- Sprint average vs non-sprint sum; 40-then-20 tie-break; unknown-gender pool.
- 20yd best-of standalone vs 40 split; Max V best-of 20–40 vs 10–20 mph.
- Athlete PDF payload/renderer omits poor, developmental, and summary blocks; coach PDF includes them.
- `NORMS_DEFAULTS_METRIC_KEYS` / editor accept `MaxVelocity`; mph cuts validate as higher-is-better overall.

---

## 6. Out of scope

- Changing the date-range CSV export.
- Applying Max Velocity zones on historical / PR / live leaderboard views.
- Replacing 40yd / 20yd split-component cuts with the Max Velocity table.
- Email send-from-app (files are downloaded and attached by the coach).
