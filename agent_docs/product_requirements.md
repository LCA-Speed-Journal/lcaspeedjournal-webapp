# Product Requirements Summary - The LCA Speed Journal

*These four areas are the MVP; everything else (reporting, gamification, etc.) is out of scope for v1.*

## Core Requirements

- **Data entry:** Form-based entry for practice metrics; parsing (single_interval, cumulative, paired_components); unit conversions (velocity_mph, distance_ft_from_cm/m, pass_through); storage in Vercel Postgres.
- **Live leaderboard:** Updates as data is entered; filter by session, metric, phase, date; boys/girls (or grouping); rank styling (e.g. gold/silver/bronze); responsive and fast on mobile and desktop.
- **Historical / progression:** Historical leaderboards with phase/date filters; progression charts over time; viewable without login.
- **Athlete management:** Roster (name, gender, grade); data entry linked to athletes; coach notes (private); athlete profiles.

## User Stories (Must-Have)

1. **Coach – data entry:** Enter athlete performance data quickly during practice so I don’t have to log it later.
2. **Coach – live leaderboard:** See a live leaderboard during practice so athletes can see results as they happen.
3. **Athlete – progress:** See my progress over time and how I rank against teammates so I understand my development.
4. **Coach – athletes:** Attach marks to specific athletes and add notes so I can personalize training and track individuals.

## Success Metrics

- **Preseason data adoption:** All preseason data points logged and analyzed in the app.
- **Daily active users:** 2–4 of ~30-person base (~7–13% daily engagement).
- **Launch goal:** Coaches doing all data entry in the app.

## UI/UX

- **Vibe:** Clean, sleek, cyberpunk — dark or high-contrast, neon-inspired accents, strong typography, minimal clutter.
- **Key screens:** Data Entry (session setup + athlete/metric/value); Live Leaderboard (filters + rank list/cards); Historical View (leaderboards + progression charts); Athlete Management (roster + athlete profile with notes).
- **Responsive:** Mobile-first; usable at practice (phone) and at home (desktop); no horizontal scroll on small screens.

## Security & Access

- Auth for data entry (coaches only); public read for leaderboards and charts.
- Coach auth: credentials (e.g. coach PIN or email+password) via NextAuth.

## Constraints

- Budget as close to zero as possible; free-only stack (Vercel, Vercel Postgres, NextAuth).
- MVP limited to the four features above; no reporting, gamification, correlations, or red-flag system in v1.
