# Historical Page Redesign: Bar Chart, Team Average, Multi-Athlete Progression, Max Velocity

**Date:** 2026-02-01  
**Goal:** Align the Vercel Historical page with detailed_viz capabilities: bar-chart leaderboard for relative performance context, team-average reference lines on progression, multi-athlete progression for comparisons, and a Max Velocity pseudo-metric for athlete-facing “top speed across all mph metrics.”

---

## 1. Scope and Definitions

**In scope**

- **Historical leaderboard:** Bar chart is the **default** view (vertical or horizontal); keep ranked cards as an optional toggle so athletes and coaches see relative performance at a glance.
- **Progression chart:** Add optional **gender-separated** team-average reference lines: “Men’s Average” and “Women’s Average” (two dashed lines), so athletes compare to their gender group, not a combined average. Support multiple athletes on the same chart (multiple lines, one per athlete) for between-athlete comparison.
- **Max Velocity:** A synthetic “metric” that, for a given date range (and optional phase), takes all entries where the metric’s `display_units` is `mph`, and for each athlete returns their **best** value in that range. Same logic for progression: per session (or per date), take the max across all mph metrics for that athlete; plot that time series. Coaches still use per-metric leaderboards and progression; athletes get a single “top speed” number and trend.

**Out of scope for this design**

- Full athlete/team dashboards (summary cards, attendance heatmaps, distribution box plots).
- Phase comparison views, category dashboards, practice-context (session vs weekly) toggles.
- Changes to data entry, live leaderboard, or auth.

**Max Velocity definition**

- **Leaderboard:** For the selected date range (and phase if set), for each athlete take the maximum `display_value` over all `entries` where the row’s metric has `display_units === "mph"`. Rank athletes by that value (descending). Units: mph. No new DB columns; computed at query time from existing `entries` + metrics registry.
- **Progression:** For each session (or date) in range, for the selected athlete(s), take the max `display_value` across all mph-metric entries for that session. One time series per athlete. Team averages are computed **by gender**: per session/date, “Men’s Average” = mean of best values among male athletes; “Women’s Average” = mean among female athletes (two reference series, not one combined).

---

## 2. API Changes

**Metrics list**

- **GET /api/metrics:** Extend response so the client can show “Max Velocity” as an option. Options: (A) Add a synthetic entry in the returned list, e.g. `{ key: "MaxVelocity", display_name: "Max Velocity", display_units: "mph" }`; or (B) Have the client add it when `metrics` includes at least one metric with `display_units === "mph"`. Recommend (A) so the API is the single source of truth: if there are no mph metrics, omit the synthetic entry; otherwise include it. No new endpoint.

**Historical leaderboard**

- **GET /api/leaderboard/historical:** Support `metric=MaxVelocity` (or agreed reserved key, e.g. `MaxVelocity`). When requested:
  - Resolve “velocity metric keys” from the registry (all keys where `display_units === "mph"`).
  - Query `entries` joined with `sessions` and `athletes` in the same date (and optional phase) range, restricted to those metric keys.
  - For each athlete, take the max `display_value`; rank by that value descending; return same response shape as today (rows with rank, athlete_id, first_name, last_name, gender, display_value, units: "mph"). Optional: include `source_metric_key` in the row (which metric produced the max) for tooltip/copy.
- Existing behavior for other metrics unchanged. Group-by-gender and phase filters apply to Max Velocity the same way.

**Progression**

- **GET /api/progression:**  
  - **Multiple athletes:** Accept one or more `athlete_id` (e.g. `athlete_id=id1&athlete_id=id2`). For each athlete, compute best per session (or per date) for the given metric in the given range. Response shape: extend to `series: Array<{ athlete_id, athlete_name?, points: ProgressionPoint[] }>` when multiple athletes requested; when a single athlete, keep current `points` for backward compatibility.  
  - **Metric = MaxVelocity:** Same as leaderboard: velocity metric keys from registry; for each session/date and athlete, take max `display_value` across those metrics; return points with units "mph".  
  - **Team average (by gender):** Add optional query param e.g. `team_avg=1`. When set, for the same metric and date range, compute **two** per-session (or per-date) series: for each session/date, take each athlete’s best for that metric (or for Max Velocity each athlete’s max across mph metrics), then **average among male athletes** and **average among female athletes** separately. Return in response as `team_avg_male_points: ProgressionPoint[]` and `team_avg_female_points: ProgressionPoint[]`. Client draws two dashed reference lines: “Men’s Average” and “Women’s Average” (distinct colors, e.g. matching Boys/Girls elsewhere).

**Response shapes (concise)**

- Historical leaderboard: already has `rows`, `male`, `female`, `units`, `metric_display_name`. For Max Velocity, `metric_display_name` = "Max Velocity", `units` = "mph". Optional per-row `source_metric_key` for tooltips.
- Progression single-athlete: `{ data: { points, metric_display_name, units, team_avg_male_points?, team_avg_female_points? } }`.
- Progression multi-athlete: `{ data: { series: [{ athlete_id, first_name, last_name, points }], metric_display_name, units, team_avg_male_points?, team_avg_female_points? } }`. Backward compatibility: if only one athlete requested, either keep returning `points` at top level or have client accept both shapes.

---

## 3. UI: Historical Leaderboard (Bar Chart)

- **Filters:** Unchanged: date range, phase, metric (including “Max Velocity” from API), group by gender.
- **Display mode:** Add a toggle or segmented control: “Bar chart” (default) vs “Cards” (current grid). Default view is **Bar chart** so relative performance is visible at a glance.
- **Bar chart:** One chart when “group by gender” is off: one bar per athlete, sorted by rank, color by gender (e.g. accent for M, secondary for F). When “group by gender” is on: two charts side-by-side (Boys / Girls) or stacked, each bar = athlete, same color scheme. Orientation: vertical bars (athlete on X, value on Y) for few athletes; optional horizontal for many (or always horizontal for readability). Use Recharts `BarChart`; tooltip shows athlete, value, units, and optionally rank and “from [metric]” for Max Velocity.
- **Styling:** Reuse existing theme (e.g. `--accent`, `--surface`, borders). Bar chart container responsive; max height or scroll for long lists.

---

## 4. UI: Progression (Team Average + Multi-Athlete)

- **Progression section:**  
  - **Athlete:** Single select or multi-select. If multi-select (2–5 athletes recommended), call progression API with multiple `athlete_id`; render one line per athlete with distinct color; legend shows names.  
  - **Metric:** Select including “Max Velocity” (same as leaderboard).  
  - **Team average (by gender):** Checkbox “Show team averages”. When checked, request with `team_avg=1` and draw **two** dashed reference lines: “Men’s Average” and “Women’s Average”, using distinct colors (e.g. matching Boys/Girls used in leaderboard). Data comes from `team_avg_male_points` and `team_avg_female_points`. If one gender has no data in range, show only the other line.
- **Chart:** Same date range as historical leaderboard. Recharts `LineChart`: one `Line` per athlete + optional “Men’s Average” line (dashed) + optional “Women’s Average” line (dashed). Tooltip: date, value(s) per athlete, men’s avg, women’s avg (when present). Empty state when no data; “Select athlete(s) and metric” when not enough selected.
- **Backward compatibility:** Single athlete + no team avg = current behavior. Single athlete + team avg = one line + two dashed lines (men’s / women’s avg) when data exists.

---

## 5. Max Velocity: Where It Appears

- **Historical leaderboard:** Metric dropdown includes “Max Velocity (mph)” when the registry has at least one mph metric. Leaderboard shows best speed in range; bar chart or cards.
- **Progression:** Same metric dropdown; “Max Velocity” shows each athlete’s best mph per session across all mph metrics; team averages = Men’s Average and Women’s Average (mean per session among male and female athletes respectively), shown as two dashed lines when “Show team averages” is on.
- **Live leaderboard (optional):** Not in this design; can add later (e.g. “Max Velocity” as a metric option for the current session).

No separate “athlete view” vs “coach view” in this design; both see the same metric list and can choose per-metric or Max Velocity.

---

## 6. Implementation Notes and Edge Cases

- **Velocity metric list:** Derive once from metrics registry (e.g. in parser or a small helper): `Object.entries(registry).filter(([, d]) => (d.display_units || "").toLowerCase() === "mph").map(([k]) => k)`. Use in historical and progression routes when `metric === "MaxVelocity"`.
- **Empty velocity set:** If no mph metrics exist, do not add “Max Velocity” to API list; if someone still calls with `metric=MaxVelocity`, return 400 or empty rows.
- **Progression multi-athlete limit:** Cap at 5–8 athletes to avoid chart clutter; client can enforce and show “Select fewer athletes” if needed.
- **Team average with one athlete:** Still meaningful (that athlete vs their gender’s average); allow it. Men’s/Women’s averages are computed from all athletes in the range, not just the selected ones.
- **Performance:** Max Velocity leaderboard/progression may scan more rows (all mph metrics). Ensure indexes on `(session_id, metric_key, athlete_id)` and date range on sessions; monitor and add composite index if needed.

---

## 7. Testing and Acceptance

- **API:** Historical with `metric=MaxVelocity` returns ranked rows, units mph; progression with `athlete_id` list returns `series`; progression with `team_avg=1` returns `team_avg_male_points` and `team_avg_female_points`. Single-athlete progression unchanged when one id and no team_avg.
- **UI:** Leaderboard defaults to bar chart; toggle to cards works; select Max Velocity and see bar chart; progression multi-select draws multiple lines; “Show team averages” shows two dashed lines (Men’s avg, Women’s avg) with distinct colors; tooltips and legend correct.
- **Edge:** No mph metrics → Max Velocity not in dropdown; empty range → empty chart/leaderboard with no error.

---

## Summary Checklist

| Item | API | UI |
|------|-----|-----|
| Max Velocity in metric list | GET /api/metrics includes synthetic Max Velocity when mph metrics exist | Dropdown shows “Max Velocity (mph)” |
| Max Velocity historical | GET /api/leaderboard/historical?metric=MaxVelocity | Same filters; rank by best mph in range |
| Bar chart leaderboard | No change | **Default:** Bar chart; toggle to Cards; Recharts BarChart; gender color |
| Multi-athlete progression | GET /api/progression?athlete_id=1&athlete_id=2&... | Multi-select athletes; one line per athlete |
| Team average (by gender) | GET /api/progression?...&team_avg=1 → team_avg_male_points, team_avg_female_points | Checkbox “Show team averages”; two dashed lines: Men’s avg, Women’s avg |

This design is ready for implementation planning (tasks, order, and file-level changes).
