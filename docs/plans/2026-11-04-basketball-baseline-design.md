# Boys Basketball Baseline Design

**Date:** 2026-11-04
**Goal:** Run a three-day boys basketball baseline as one live, points-ranked meet for about 30 athletes, with sub-teams or a top-18 line, without changing the existing top-8 testing-day report.

## Schedule

| Day | Date | Tests |
| --- | --- | --- |
| A, Rate and Reactivity | Monday 2026-11-16 | 10-5 RSI plus one quadrant label, 40yd scored as 0-20, 0-40, and max velocity, DRI at 6, 12, 18, and 24 in |
| B, Magnitude | Wednesday 2026-11-18 | Standing broad jump, vertical jump, overhead med-ball throw |
| C, Capacity | Friday 2026-11-20 | 10×10 m only, two lanes, 10 s rest |

## What stays

The current testing-day report still scores places 1–8 as `10, 8, 7, 6, 4, 3, 2, 1` inside gender, and averages the sprint family. Do not change `pointsForPlace` in `src/lib/norms/testing-day-rank.ts`. Soccer and every other sport keep that report.

A battery is a new object that points at three normal sessions. Data entry, parsing, and the single-metric leaderboard stay as they are.

## Meet board

Two public views, polled like the live leaderboard:

- **Today.** Columns for the open day only.
- **Meet.** Every scored column across the closed days plus the open day.

Twelve rows per page, auto-advance, tap to pause. Untested athletes sit under a divider and do not fill a top-18 slot.

**Cutoff mode.** One list. A line under place 18. Ties on the bubble stay above the line.

**Sub-team mode.** Varsity, JV, and C-team lists belong to this battery, not to the athlete. The TV cycles Overall, then each group. Group pages re-rank inside the group. Overall place stays visible.

## Points

`full_field` points = number of athletes on that board with a strictly worse mark, plus 1. Ties share the place and the points. The next place skips. Direction is stored on the column. Seconds are lower-better. DRI is higher-better. Repeat-sprint decrement is a percent and lower-better.

Counted slots, nine total:

1. RSI
2. Sprint average (0-20, 0-40, and max velocity each get a place, then those points are averaged, same rule as `scoreAthleteTotals`)
3. DRI
4. Broad jump
5. Vertical jump
6. Med-ball throw
7. 10×10 best
8. 10×10 mean
9. 10×10 decrement

A missing sprint split is left out of the average. A blank on an open station is blank. Closing the day turns a blank into 0. The chip reads tests completed out of 9.

Sprint columns come from the existing helpers: `pickBestTwentyYdHits` and `pickBestMaxVelocityHits` in `src/lib/norms/testing-day-derived.ts`. Max velocity is mph from the flying 20.

## DRI

Coaches type the number the mat shows. Boxes:

- 6 in, entry and return-to-play
- 12 in, standard high-school test
- 18 in, trained, more eccentric demand
- 24 in, elite, only with a proven reactive base

Bands: under 0.5 Warming Up, 0.5 up to 1.25 Rebound Ready, 1.25 up to 2.0 Pretty Springy, 2.0 through 3.0 Bouncy, above 3.0 Elite. A mark on 0.5, 1.25, or 2.0 takes the higher band. Exactly 3.0 stays Bouncy.

One leaderboard column: the box whose full-roster median DRI is highest. A median tie uses the lower box. Closing Monday locks the box. DRI is ranked only against other DRI marks. It is never lined up against an RSI number.

When an athlete's best box is higher than the team box, the report flags them for a higher eccentric load.

## 10-5 quadrant

One RSI number: the mat's average of the five best jumps out of ten. One label for where the majority landed: Reactive (blue), Compliant (red), Stiff (green), Developing (yellow). The label is a note. The gym cell shows the number and that color.

## 10×10 and Friday lanes

Ten independent rep times. All three scores need all ten reps.

- Best: fastest rep, seconds, lower better
- Mean: average of ten, seconds, lower better
- Decrement: `(sum / (fastest × 10) − 1) × 100`, lower better

Friday heats are seeded from the meet after Monday and Wednesday: 1 with 2, 3 with 4, and so on, overall place. Heats run from the bottom, so 1 vs 2 is last. An odd leftover runs alone in the opening heat. Printing the sheet freezes it. Lanes do not change scoring.

## Bibs

Three digits. First digit is grade in 2026–27: 1 = 9th (class of 2030) through 4 = 12th (class of 2027), from `graduating_class`. The other two digits are alphabetical order inside that grade. Bibs freeze when the hand sheet is issued. A later add gets the next free number in that grade.

Entry on a battery session is station-sticky and ID-first. Three digits resolve to a large name before the save.

## Soccer comparison

On broad jump, 0-20, 0-40, max velocity, and overhead med-ball, the live cell shows the basketball mark, the mark from the boys soccer testing session on 2026-09-02, and the change. Faster or farther is the improvement. Vertical, RSI, DRI, and the 10×10 stay basketball-only. No soccer entry means a blank comparison, and it does not change the sort.
