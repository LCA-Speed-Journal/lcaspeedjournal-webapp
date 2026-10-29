# Speed windows on leaders, historical, and trends

**Date:** 2026-10-29  
**Goal:** Show each acceleration and each adjacent build-in on its own, point Max Velocity at the fastest build-in, and draw team speed as a curve and a season change.

Saves stay as they are. `src/lib/speed/windows.ts` still writes `Acceleration` (seconds, start at 0) and `BuildIn` (time in `value`, mph in `display_value`). A fly that skips a gate is still stored. These screens only change what they read.

---

## 1. Decisions

| Decision | Choice |
|----------|--------|
| Team-leader accelerations | One line per window that starts at 0 (`0-5yd`, `0-10yd`, `0-20yd`, `0-40yd`). Rank by lowest time. Men and women stay separate columns |
| Team-leader build-ins | One line per adjacent fly (`5-10yd`, `10-20yd`, `20-40yd`). Rank by highest mph |
| Yards and meters | Separate lines and separate charts |
| Skipped-gate flies | Stored, eligible for Max Velocity, omitted from leader lines, the scatter plot, and season charts. `10-40` contains `10-20` and `20-40`, so it is omitted |
| Adjacent | No other window from the same session sits strictly inside it |
| Max Velocity | Highest `BuildIn` mph in the range. The label names the window (`22.40 mph · 20-30yd`). Resisted sleds stay out |
| Historical | Max Velocity is that best. The menu also lists each adjacent acceleration and build-in that exists between the selected dates. A chart request is the metric plus the component |
| Sports-page chart | One dot per athlete: their best adjacent fly in the date range, placed at the middle of the fly. A curve through the median at each distance, anchored at 0 mph at the start. Hover shows name, window, and mph |
| Athlete page | Same chart for one person. The fastest dot names its window |
| Team-progress speed | A Speed trends section beside Testing trends. Median percent change from each athlete’s first mark in the window. Tooltip shows raw mph and percent change (min, mean, median, max). Higher mph is an improvement |
| 5-15yd baseline | The force-to-form estimate from that athlete’s `5-10yd` and `10-20yd` seconds on their first speed session in the window. Later points are the best timed `5-15yd` mph. If either split is missing or the reconstruction fails, the baseline is the first timed `5-15yd` |
| Database | No new columns and no new rows |

**Success criteria**

- A 40-yard test with gates at 0, 5, 10, 20, and 40 produces separate leader lines for `0-5yd`, `0-10yd`, `0-20yd`, `0-40yd`, `5-10yd`, `10-20yd`, and `20-40yd`. Different athletes can lead different lines.
- Historical Max Velocity shows a point when build-ins exist, and the point names the window. Filtering to `10-20yd` compares athletes on that fly only.
- The sports-page chart shows a stack of dots at each fly and a curve from 0. It does not draw one horizontal bar per fly.
- Repeating a `5-15yd` moves the Speed trends line off the estimated baseline. The tooltip shows mph and percent change.

---

## 2. How a window is chosen

Team leaders currently collapse every `Acceleration` into one row and every `BuildIn` into one row, because `isPrimaryResultComponent` treats an unknown metric as a single result (`src/lib/athletes/team-leaders.ts`). Group by metric plus component instead.

Max Velocity, the progression chart, the historical leaderboard, and the team-progress scoreboard stop using `getVelocityMetricKeys()` (the old mph splits in `src/lib/metrics.json`, including resisted sleds). They take `MAX(display_value)` where `metric_key` is `BuildIn`. The row that supplies that max also supplies the window name.

Historical loads the adjacent components that exist for the selected dates, then requests one: `Acceleration` or `BuildIn`, plus the component. `MaxVelocity` has no component.

The `5-15yd` baseline calls `reconstructFiveFifteen` (`src/lib/norms/f2f/reconstruct-515.ts`) with the seconds in `value` for `5-10yd` and `10-20yd` on the athlete’s first speed session in the reporting window. The chart stores the returned mph. Later sessions use the best timed `5-15yd` `display_value`. Percent change is `(new − baseline) / |baseline|`, the same helper Testing trends already uses, so a faster fly is positive.

---

## 3. Screens

**Team leaders** (`TeamOverviewDashboard`). Flat lines under Acceleration and Build-in, sorted by start then end. A cell is the athlete and the value. The Max Velocity cell adds the window. Overall and each Hugo block use the same rows.

**Historical.** The metric menu keeps Max Velocity and adds one entry per adjacent window in the date range. The progression point and the leaderboard row name the window when the metric is Max Velocity.

**Sports page.** The horizontal build-in bars on each Hugo block are replaced by the scatter plot. Meters are a second chart when that group has meter data. The profile API returns the athlete’s name with each row.

**Athlete page.** The same plot for that athlete’s best adjacent fly at each distance. The fastest dot names its window.

**Team progress.** Speed trends sits beside Testing trends and reuses that chart. One card per adjacent build-in that was repeated in the window. `5-15yd` uses the estimated baseline above. The existing 40-yard and jump cards stay. The Max Velocity scoreboard card reads build-ins.

---

## 4. Errors

A date range with no build-ins leaves Max Velocity empty and omits the scatter plot and Speed trends. A window with no rows is left out of the menu and the leader table. If `5-10yd` and `10-20yd` cannot be reconstructed, that athlete’s `5-15yd` baseline is their first timed `5-15yd`. If they have neither, they are left out of that chart. Yards and meters are never drawn on one axis. A missing speed-window column still returns an empty profile, as `/api/speed/profile` does today.

---

## 5. Tests

- Leader rows split `0-10yd` from `0-40yd`, and `5-10yd` from `20-40yd`. `10-40` is not a leader line. Yards and meters do not share a line.
- Max Velocity picks the highest `BuildIn` mph and keeps that row’s window. A resisted sled does not win.
- A window with another window strictly inside it is not adjacent. A timed `5-15yd` with nothing inside it is adjacent.
- Curve points are one best mph per athlete per fly, at the middle of the fly, and the curve includes (0, 0).
- A `5-15yd` season point uses the reconstructed mph as the baseline and a later timed mph as the change. A missing split falls back to the first timed `5-15yd`.

There is no React component test runner in this repo. Screens call these helpers.

---

## 6. Out of scope

Changing how a sprint is saved or migrated. Drop-off lines, resisted sleds, hurdles, jumps, and agility. Copying a build-in into a stored `MaxVelocity` row. Non-adjacent flies on leader lines, the scatter plot, or Speed trends.
