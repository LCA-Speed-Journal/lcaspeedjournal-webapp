# Team Progress (Hugo Sport Dashboard + PDF)

**Date:** 2026-09-15  
**Goal:** Give coaches a season-long view of how one Hugo sport progressed — testing metrics, key lifts, ISO Rock durations, and per-athlete Force-to-Form — plus a printable end-of-season PDF.

---

## 1. Decisions and success criteria

| Decision | Choice |
|----------|--------|
| Team unit | Hugo sport roster (`athlete_hugo_memberships`) |
| Surface | Dedicated coach-auth page `/reporting/team-progress` + PDF export |
| Date filter | Custom range with presets (Hugo season, school year, last 90 days); max 12 months |
| Tests | Core set for every group + per-group extras + ephemeral “Add test” |
| Lifts | Squat (Goblet/Front), Press (Bench or OHP), Hinge (RDL) |
| ISO Rocks | Prescribed weekly duration from templates (not scanned athlete holds) |
| F2F | Per-athlete first vs last only; no team-median triangles |

**Success criteria**

- Coach picks a Hugo group and date range and sees headline deltas, charts, ISO Rocks, and F2F for athletes who tested twice.
- Volleyball auto-includes RSI; soccer auto-includes 5-10-5; other sports can add metrics that have data.
- One click downloads a coach PDF suitable for end-of-season meetings.
- No-shows do not dilute F2F (only athletes with two eligible profiles appear).

---

## 2. Headline registry

Config in `src/lib/team-progress/headlines.ts` (not a DB table).

**Core tests:** `40yd_Dash` (fallback `20yd_Dash`), `MaxVelocity`, `Standing-Broad`, `Vertical Jump`, `OH-MB_Throw`.

**Group extras:** volleyball → `10-5_RSI`; soccer / womens_soccer → `5-10-5_Agility`.

**Lifts:** alias match on `workout_movements.name` → squat | press | hinge.

**ISO Rocks:** ISO-Lunge, Spring Ankle, Sprinter Bridging, Copenhagens — parse seconds from template notes/targets.

---

## 3. Aggregation

- **Tests:** per session date, best mark per athlete → team median; first/last when `n ≥ 3`; `improved_pct` among athletes with both marks.
- **Lifts:** per ISO week, max `load_reps` per athlete → team median.
- **ISO Rocks:** max prescribed seconds per rock per week from templates for that Hugo group.
- **F2F:** `buildF2fProfile` per athlete per eligible session; keep athletes with ≥2 profiles; expose first and last.

---

## 4. API and UI

- `GET /api/reporting/team-progress?hugo_group=&from=&to=&extra_metric=` (coach auth)
- `GET /api/reporting/team-progress/pdf?...` (coach auth)
- Page: filters, scoreboard, charts, ISO Rocks, per-athlete F2F, athlete table, PDF download

---

## 5. Out of scope (v1)

Public access, persisted custom metric lists, trap-bar as a fourth lift, duration OCR into `set_results`, team-median F2F, raising weight-room report 84-day cap.
