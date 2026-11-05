# Attendance Reporting

**Date:** 2026-10-05  
**Goal:** For each Hugo sport, show average weekly attendance as a percent of the roster (overall and by Liberty / Homeschool / Co-Op), a season heatmap of who showed up with varsity game markers, and the same two rates on each athlete.

---

## 1. Decisions

| Decision | Choice |
|----------|--------|
| Present mark | Confirmed weight-room card **or** Speed Journal testing entry, once per athlete per day |
| Card scope | A card counts only for the sport on that `session_logs.hugo_group` |
| Testing scope | A testing entry has no sport, so it counts for every sport that athlete belongs to |
| Team rates | Both headcount and session fill, then the unweighted mean of those weekly rates |
| Athlete rates | Both session rate and week rate |
| Enrollment | One of Liberty, Homeschool, Co-Op on the athlete. Edited on the sport roster. Follows them onto every sport |
| Empty weeks | Every Monday–Sunday week that overlaps the range is in the headcount average. Nobody present is 0% |
| Sessions | The sport’s weekly rhythm, even when nobody is logged. Cancel or add a date by hand |
| Season window | Coach-picked from/to. Inclusive length over 366 days is rejected |
| Games | Varsity only, from Bound, saved in our database. Coach can add, change, or dismiss a date. Refresh does not bring a dismissed date back and does not delete manual dates |
| Roster for a week | Current members whose membership `created_at` (America/Chicago date) falls on or before that week’s Sunday. A week-4 join is left out of weeks 1–3 and counts for all of week 4. Removing a membership drops them from the whole report |
| Who can see it | Coach login, same as the rest of the weight room |

**Success criteria**

- A coach picks a sport and a date range and sees both season averages, the three enrollment splits, an unset count, each athlete’s two rates, and a day heatmap with headcount and varsity markers.
- Volleyball defaults to Mon/Wed, boys soccer to Tue/Fri, and XC, football, women’s tennis, and women’s soccer to Mon/Thu. Other sports have no days until a coach sets them. Headcount still runs. Session fill waits until days exist.
- A scheduled day with zero logs stays in the session-fill denominator until the coach cancels it.
- Refresh from Bound can fail without erasing saved games. Manual add and dismiss still work.
- The athlete page shows the same two rates per sport, using the from/to last saved for that sport in this browser.

---

## 2. How a week is scored

Weeks are Monday–Sunday. A week counts when it overlaps the picked range. Scheduled dates are rhythm weekdays inside the range, plus `add` edits, minus `cancel` edits. A game marker does not create a session.

**Headcount.** Athletes on that week’s roster who have any present mark on a date in that week and inside the range, divided by that week’s roster. A present mark on a day that is not a scheduled session still counts.

**Session fill.** Present marks on scheduled dates only, divided by roster size times scheduled dates that week. A logged day that is not scheduled does not enter this numerator, so the rate stays at or under 100%. A week with zero scheduled dates stays in the headcount average and drops out of the session-fill average.

**Season number.** Unweighted mean of the weekly percents. A partial first week counts as one week, the same as a full week. A split with nobody in it shows no percent. Unset athletes stay in the team total and out of the three splits.

**Athlete, for dates while they were on the roster.** Session rate is scheduled days they attended, divided by scheduled sessions. Week rate is weeks with any present mark, divided by overlapping weeks. No scheduled sessions means the session rate is blank.

---

## 3. What we store

Attendance is computed. It is not a new log.

- `athletes.enrollment` — `liberty`, `homeschool`, or `coop`, nullable until a coach sets it.
- `sport_practice_rhythms` — one row per sport, weekdays as ISO numbers (Monday = 1). Seed the six fall sports above.
- `attendance_session_edits` — `(hugo_group, session_date, action)` with action `add` or `cancel`.
- `varsity_contests` — one row per sport per date. `source` is `bound` or `manual`. `dismissed` keeps a Bound date from returning on refresh. Deleting a visible game sets `dismissed`. Adding that date again clears it and marks the row manual.

`hugo_group` is checked in the app with `isHugoGroup`, and the migration CHECK list matches `HUGO_GROUPS` in `src/lib/weight-room/constants.ts`.

---

## 4. Screens and APIs

All writes and the report read use `requireCoachSession`.

- Weight-room hub link to `/weight-room/attendance`.
- That page: sport, from, to, weekday checklist, session add/cancel, refresh Bound, game list, unmatched Bound rows from the latest refresh, both averages, splits, unset count, athlete table, heatmap. Each cell is that day’s roster headcount. A marker means a saved, non-dismissed varsity date.
- Sport roster row: Enrollment menu beside Gender and Grade. Saving patches the athlete.
- Athlete page, under Hugo teams: the two rates per sport. From/to defaults from `localStorage` key `attendance-range:v1:<hugoGroup>`. The attendance page writes that key. If it is missing, the block waits for dates.

`GET /api/weight-room/attendance?hugo_group&from&to` returns the computed report. Rhythm, session edits, and games have their own coach-only writes. Refresh fetches `https://www.gobound.com/mn/schools/lclassical`, keeps varsity contests that match the sport, skips cancelled and non-varsity levels, and upserts Bound rows that are not dismissed. Zero parsed contests is a failed refresh: saved rows stay, and the response says so. Unmatched varsity contests come back on that response so the coach can attach a date by hand.

---

## 5. Tests

`buildAttendanceReport` in `src/lib/attendance/report.ts` is pure. Tests cover dedupe of card plus testing on the same day, a zero-attendance rhythm day, cancel, add, a late join, a partial first week, an empty week at 0% headcount, a no-session week omitted from session fill only, enrollment splits, an unset athlete, a present mark on a non-scheduled day (headcount yes, session fill no), and a dismissed game with no heatmap marker.

The Bound parser is tested against a checked-in fixture. Varsity maps. Junior varsity, C team, middle school, elementary, and cancelled rows do not.

---

## 6. Out of scope

Public access, attendance stored as its own check-in, JV or lower as game flags, historical roster after someone is removed, and treating a varsity game as a practice session.
