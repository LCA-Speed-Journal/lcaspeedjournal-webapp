# Product Requirements Document: The LCA Speed Journal MVP

---

## 1. Product Overview

| Field | Value |
|-------|-------|
| **Name** | The LCA Speed Journal |
| **Tagline** | The home base for LCA Track & Field and LCA Strength & Conditioning |
| **Goal** | Coaches doing all data entry in the app |
| **Timeline** | TBD (Vercel deployment) |

The LCA Speed Journal is a web application that centralizes performance data, live leaderboards, and athlete management for LCA Track and Field and Strength & Conditioning. It replaces manual data entry, hand-written notes, and scattered spreadsheets with a single, streamlined system.

---

## 2. Target Users

### Primary: Coaches
- **Role:** Enter practice data, manage athletes, pull insights
- **Pain points:** Manual data entry after practice, juggling hand-written notes, no easy way to track trends
- **Needs:** Fast data entry during practice, live leaderboards, automatic parsing and analysis, athlete-specific notes
- **Tech-savvy:** Variable; must work on mobile at practice and desktop at home

### Secondary: Athletes
- **Role:** View live-marks, their progress, and team context
- **Pain points:** No easy way to see progress or compare to peers
- **Needs:** Team leaderboards, progression charts, personal progress view
- **Tech-savvy:** Generally comfortable with phones and web apps

### Tertiary: Spectators
- **Role:** Parents, fans, alumni following the team
- **Pain points:** No central place to see practice results
- **Needs:** Practice numbers, team leaderboards, simple read-only access
- **Tech-savvy:** Varies; needs simple, clear layout

---

## 3. Problem Statement

**Before the LCA Speed Journal:**
- Coaches spend time on manual data entry and post-practice logging instead of coaching
- Athletes lack visibility into their progress and how they compare to teammates
- Spectators have no way to follow team performance between meets
- Data lives in spreadsheets and notebooks, making analysis and sharing difficult

**What we're solving:**
- Streamlined, in-practice data entry that reduces admin work
- Live leaderboards during practice to drive engagement
- Automatic parsing, tracking, and analysis of performance data
- A single place for athletes to see their marks in context
- A public-facing view for spectators to stay connected with the team

---

## 4. User Journey

### Coach Journey
**Before:** Coach records times/measures by hand at practice, enters data into spreadsheets later, keeps separate notes on athletes.

**After:** Coach opens the app on phone or tablet during practice, enters data as athletes complete efforts, sees a live leaderboard update in real time. Data is parsed, stored, and analyzed automatically. Athlete notes live in the app. Post-practice analysis is ready without extra work.

**Outcome:** Less admin, more coaching; data is accurate and immediately useful.

### Athlete Journey
**Before:** Athlete has no clear view of progress or standing.

**After:** Athlete opens the app, sees team leaderboards and progression charts, checks personal progress and how it compares to peers.

**Outcome:** Greater motivation and clarity on development.

### Spectator Journey
**Before:** No way to follow practice results between meets.

**After:** Spectator visits the app, views practice numbers and team leaderboards in read-only mode.

**Outcome:** More engagement and connection with the team.

---

## 5. MVP Features

### Feature 1: Data Entry and Processing
**What it does:** Form-based data entry for practice metrics (times, distances, etc.) with intelligent parsing, unit conversion, and storage.

**User story:** As a coach, I want to enter athlete performance data quickly during practice so that I don't have to log it later.

**Success criteria:**
- Coaches can enter data on mobile and desktop
- Coaches can easily change/adjust metrics collected in-session
- Input is parsed and expanded (e.g., cumulative splits → discrete splits)
- Unit conversions apply correctly (e.g., time → mph, m → ft)
- Data persists and is available for leaderboards and analysis

---

### Feature 2: Live Leaderboard
**What it does:** Real-time leaderboard showing top performers for selected metrics, optimized for in-practice use.

**User story:** As a coach, I want a live leaderboard during practice so that athletes can see results as they happen.

**Success criteria:**
- Leaderboard updates as new data is entered
- Filters by session, metric, phase, date
- Responsive and fast on mobile and desktop
- Boys and girls displayed (or by chosen grouping)
- Clear rank-based visual hierarchy (e.g., gold/silver/bronze styling)

---

### Feature 3: Historical Progression / Leaderboard
**What it does:** Post-practice view of leaderboards and progression over time (all-time, by phase, by mesocycle).

**User story:** As an athlete, I want to see my progress over time and how I rank against teammates so that I understand my development.

**Success criteria:**
- Historical leaderboards with phase/date filters
- Progression charts showing improvement over time
- Athletes and spectators can view without logging in
- Data reflects all preseason and in-season entries

---

### Feature 4: Athlete Management
**What it does:** Associate data with individual athletes, manage athlete profiles, and store coach-specific notes.

**User story:** As a coach, I want to attach marks to specific athletes and add notes so that I can personalize training and track individuals.

**Success criteria:**
- Athlete roster with core metadata (name, gender, grade)
- Data entry links to athlete profiles
- Coach notes, archetyping per athlete (private to coaches)
- Clear separation of athlete-level data for personalization

---

## 6. Success Metrics

| Metric | Target | Why it matters |
|--------|--------|----------------|
| **Preseason data adoption** | All preseason data points logged and analyzed in the app | Validates that coaches use the app as primary data source |
| **Daily active users** | 2–4 of ~30-person base | ~7–13% daily engagement; indicates regular use |

**Launch goal:** Coaches doing all data entry in the app (no more manual spreadsheets or notebooks for core metrics).

---

## 7. Design Direction

**Vibe:** Clean, sleek, cyberpunk

**Implications:**
- Dark or high-contrast theme with clear typography
- Accent colors that feel modern (e.g., neon-inspired accents, strong highlights)
- Minimal clutter; focus on data and rankings
- Responsive layout for mobile (practice) and desktop (review)

**Key screens:**
1. **Data Entry** — Session setup + athlete/metric/value entry
2. **Live Leaderboard** — Grid/cards of top performers, filters in sidebar
3. **Historical View** — Leaderboards + progression charts
4. **Athlete Management** — Roster and athlete profiles with notes

---

## 8. Technical Considerations

| Area | Requirement |
|------|-------------|
| **Platform** | Vercel-hosted web app; mobile and desktop |
| **Data Entry** | Optimized for both mobile and desktop (touch-friendly, fast) |
| **Performance** | Live leaderboard must be responsive and feel real-time |
| **Security** | Auth for data entry (coaches only); public read access for visualizations |
| **Storage** | Google Sheets integration for future expansions/analyses; Vercel-compatible DB for app-responsiveness and read-write speed |

---

## 9. Constraints

| Constraint | Details |
|------------|---------|
| **Budget** | As close to zero as possible; coach-funded |
| **Platform** | Mobile + desktop; data entry usable in both contexts |
| **Performance** | Live leaderboard must load quickly and update smoothly |
| **Security** | Coach-only data entry; anyone can view leaderboards and charts |
| **Scope** | MVP limited to 4 features; no reporting, gamification, correlations, or red-flag system in v1 |

---

## 10. Definition of Done (Launch Checklist)

- [ ] **Data Entry:** Coaches can enter data on mobile and desktop; data is parsed and stored correctly
- [ ] **Live Leaderboard:** Live leaderboard is fast and usable during practice
- [ ] **Historical View:** Leaderboards and progression charts are available and filterable
- [ ] **Athlete Management:** Athlete roster exists; data links to athletes; coach notes are supported
- [ ] **Auth:** Only authenticated coaches can enter data; visualizations are viewable by all
- [ ] **Responsive:** App works well on phone and desktop
- [ ] **Deployed:** App is live on Vercel
- [ ] **Preseason Goal:** All preseason data points logged in the app
- [ ] **Engagement Goal:** 2–4 daily active users from the ~30-person base

---

## Version 2 (Out of Scope for MVP)

| Feature | Why it waits |
|---------|--------------|
| **Reporting** | Manual reference is acceptable; tracking is the v1 priority |
| **Athlete gamification** | Leaderboards provide enough motivation for v1 |
| **Metric correlation** | Useful but not core to baseline functionality |
| **Red-flag system** | Coaches can rely on intuition for now |

---

*PRD created: January 2026*  
*Next step: Run /vibe-techdesign to create the Technical Design Document*
