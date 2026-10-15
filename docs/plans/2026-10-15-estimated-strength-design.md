# Estimated strength from submax work

**Date:** 2026-10-15  
**Goal:** Turn logged load, reps, and RPE into an estimated 1RM for each strength pattern, including past in-season sessions, and give extracurricular a printable per-athlete working-weight table.

---

## 1. Decisions

| Decision | Choice |
|----------|--------|
| Estimate | Load ÷ percent of 1RM from the Liberty relative-intensity chart |
| RPE source | Coach override, else the card target for that set, else an RM attempt as RPE 10 |
| Which set counts | Highest estimated 1RM for that athlete, exercise, and day |
| Conversion | Dietz Max Sheet ratios, plus Hugo aliases, applied only inside one pattern |
| Patterns | Squat, hinge, single-leg, press, pull, and power when those lifts are logged |
| Cross-pattern | A log updates only its own pattern. Sheet links are a starting snapshot, not a live tie |
| History | Computed from existing `set_results` and card targets. Prescription text with no load is skipped |
| Working weights | Printable table on a new extracurricular page. The shared card is unchanged |
| RPE nudge | ±1.5 from the prescription, in steps of 0.5, clamped to RPE 3–10 |
| Who can see it | Coach login, same as the weight room and Team Progress |

**Success criteria**

- An in-season set saved as `185x3` on a target of `3 @ RPE 8` shows an estimated max on the athlete page and on Team Progress without re-entry.
- A shoulder or bench day moves press variations together and leaves pull, squat, hinge, and single-leg unchanged.
- A goblet squat of 100 lb implies about a 125 lb front squat. A lunge moves the split-squat line and does not replace it as the reference.
- The extracurricular page prints suggested loads for one week/day, one column per athlete, rounded to 5 lb. RM attempts show a test ceiling.
- A coach can raise or lower the RPE of a logged set by up to 1.5. The next session’s suggested loads use the new estimate.

---

## 2. Estimate

The Liberty chart is the max-effort row, scaled by RPE. Checked values: RPE 10 for 1 rep is 100%, RPE 8 for 5 reps is 78.8%, RPE 7 for 3 reps is 78.6%.

Max-effort percent by reps: 1 = 100, 2 = 95, 3 = 92.5, 4 = 90, 5 = 87.5, 6 = 85, 8 = 80, 10 = 72.5. Reps 7 and 9 are the midpoint of their neighbors. Reps outside 1–10 are not estimated.

Intensity = `1 - 0.05 * (10 - RPE)`. Each half RPE is 2.5%, one row on the chart. Percent of 1RM = max-effort percent × intensity. Estimated 1RM = load ÷ that percent.

RPE order for a set:

1. `set_results.rpe_override`, when set.
2. The matching `workout_movements.targets` entry, such as `3 @ RPE 8` or `6/side @ RPE 7`.
3. An RM attempt (`3RM Attempt`, `5RM`) as RPE 10 at the logged reps.

Bodyweight, jumps, timed sets, and AMRAP without a load are skipped. The stored override is the effective RPE. Clearing it returns to the prescription. A nudge that would leave RPE 3–10 stops at the edge.

---

## 3. Patterns stay independent

Ratios live in a static table taken from the Max Sheet (DB Bench = 0.35 × bench, Hex Deadlift = 1.15 × squat, RDL = 0.75 × squat, Lunge = 0.40 × squat, DB Split Squat = 0.50 × squat, and the rest of that sheet). A Hugo alias list maps card names onto those columns. Unmapped names (TRX, Nordic, leg curl, jumps) produce no max.

Goblet squat is one step below front squat, using the same 0.80 factor the sheet uses from back squat to front squat. Goblet = 0.80 × front squat = 0.64 × back squat.

Each pattern has one reference so a change of exercise stays on the same line:

| Pattern | Reference | What else feeds it |
|---------|-----------|--------------------|
| Squat | Back squat | Front squat, goblet squat |
| Hinge | Trap-bar / hex deadlift | RDL and other hinge variations |
| Single-leg | Split squat (0.50 × back squat) | Lunge at 0.80 of that line |
| Press | Bench | DB bench per dumbbell, incline, shoulder press |
| Pull | Lat pulldown | Rows and pulldowns with a logged load |
| Power | Power clean | Clean, snatch, DB push press |

Press and pull are both percents of bench on the sheet. Squat, hinge, and single-leg are all percents of back squat. Those links are not live. A logged set updates only its pattern. Sibling exercises inside that pattern scale from the new reference. A press day raises every pressing suggested load. Pull stays put.

Suggested load = that pattern’s reference × (exercise ratio ÷ reference ratio) × chart percent for the prescribed reps and RPE. Example: press-line bench 200, DB bench 0.35, 6 reps at RPE 8 (76.5%) → about 55 lb per dumbbell.

Until a pattern has a logged estimate, its baseline fills in. Saving back squat, bench, and power clean also writes a one-time seed: hinge and single-leg from the squat anchor, pull from the bench anchor. Later logs and later edits to those anchors move only squat, press, or power. Hinge, single-leg, and pull stay on the snapshot until that pattern is logged or its own baseline is edited.

Suggested loads for a session use estimates from before that day. Same-day work does not feed the sheet printed before they lift.

---

## 4. Data

No historical backfill. Estimates are computed on read from `set_results` (`kind = load_reps`, `load`, `reps`) joined to the movement name and `targets`.

Migration, safe to re-run, next to `scripts/migrate-weight-room.sql`:

- `set_results.rpe_override NUMERIC NULL`
- `athlete_strength_baselines`: one row per athlete per pattern, with the value in pounds and whether it was a coach entry or a seed snapshot

Manual log save keeps an existing override when the grid is saved again. Coach session is required on every new route, same as the other weight-room writes.

---

## 5. Screens

**Athlete page.** A section on the athlete dashboard. Pattern lines, latest value, change from the first estimate in the view, and the source set (date, exercise, load, reps, effective RPE). A converted goblet squat is labeled as goblet, not as a tested back squat.

**Team Progress.** An Estimated strength block on the existing page, using that page’s group and date range. The group line is the median athlete. One athlete can be selected. The chart follows the existing Team Progress line chart.

**Manual log.** Each athlete cell that has a real load shows the effective RPE and can step it by 0.5, up to 1.5 away from the prescription.

**Extracurricular dashboard.** Coach-only `/weight-room/extracurricular`, linked from the weight-room hub.

- Growth chart for the extracurricular roster: one athlete or the group median.
- Baseline editor for back squat, bench, and power clean, with the hinge, single-leg, and pull seeds visible and editable.
- Printable working-weight table for a chosen week and day. Rows are movements with a load prescription. Columns are athletes on the extracurricular roster. Each cell is the suggested load at the prescribed reps and RPE. An RM-attempt row shows a test ceiling. Empty when that pattern has neither a prior estimate nor a baseline. Round to the nearest 5 lb. Print uses the card-print approach.

---

## 6. Errors

An unmapped movement, a set with no load, or reps outside 1–10 produces no estimate and a blank print cell. A failed baseline save leaves the previous baselines in place and shows the server error. Missing login redirects the same way as the other coach pages. A pattern value that is not one of the six is rejected with 400.

---

## 7. Tests

- Chart cells: RPE 10 × 1 = 100%, RPE 8 × 5 = 78.8%, RPE 7 × 3 = 78.6%.
- Goblet 100 lb implies a 125 lb front squat.
- A lunge converts onto the split-squat line and does not become the reference.
- DB bench at a 200 bench estimate, 6 reps at RPE 8, suggests about 55 lb.
- A new press estimate does not change the pull suggested load.
- An RPE override replaces the card target. A nudge past RPE 10 or below RPE 3 clamps. Clearing the override restores the prescription.
- Sets saved as prescription text only are absent from the series.
- The read API requires a coach session.

Browser check after the screens exist: an athlete with old in-season loads, Team Progress for one Hugo group, and the extracurricular printout for one week.

---

## 8. Out of scope

Writing per-athlete loads back onto the shared template, a live tie from bench to pull or from squat to hinge and single-leg, estimates for bodyweight and unmapped accessories, and an athlete-facing view of these numbers.
