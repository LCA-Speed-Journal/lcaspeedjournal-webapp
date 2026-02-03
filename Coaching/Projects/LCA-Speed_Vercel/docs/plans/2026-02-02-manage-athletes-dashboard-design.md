# Manage Athletes Page: Dashboard Transformation

**Date:** 2026-02-02  
**Goal:** Transform the manage-athletes page from a basic add/roster view into a coach-facing hub with a sidebar (roster + add-athlete), team-overview dashboard, and per-athlete dashboard for viewing and managing athlete information.

---

## 1. Layout & Navigation

**Page structure**

Two-column layout:

- **Sidebar (left, ~280–320px):** Collapsible on mobile. Contains:
  - Header with "Manage athletes" and nav links (Data entry, Home)
  - "Add athlete" — compact form or button that opens a dialog
  - "Roster" — list grouped by graduating class (2026, 2027, Staff, Alumni, etc.); each athlete has an **Active** checkbox for the current season
  - Links: "Manage Event Groups", "Manage Presets" — open dialogs or slide-out panels on the same page
  - Settings link to `/settings` for deeper config

- **Main area (right) — two modes:**
  - **Team overview (no athlete selected):** Team-level dashboard of the **active** roster: event-group distribution, team metric PRs, progression trends, archetype mix, and high-level superpower/kryptonite themes
  - **Athlete view (athlete selected):** Per-athlete dashboard with events, PRs, progression & flags, archetypes, superpowers/kryptonite, and coach notes

**Active flag**

Athletes get an `active` boolean for "on this season's roster." Inactive athletes remain in the roster list but are excluded from team-overview stats. Staff/Alumni can be active or inactive.

**Selection & URL**

- No `?id=` param → show team overview
- `?id=<uuid>` → show that athlete's dashboard

**Settings (hybrid)**

- Quick links from athletes page ("Manage Event Groups", "Manage Presets") open dialogs or sections on the same page
- Dedicated `/settings` route for deeper config and future expansion (more settings as the app grows)

---

## 2. Data Model & Schema

**`athletes` (modify):**
- Add `active BOOLEAN NOT NULL DEFAULT true`

**`event_groups` (new):**
- `id`, `name` (e.g. "Sprints", "Horizontal Jumps"), `display_order`, `created_at`
- Configurable via settings

**`athlete_event_groups` (new):**
- `athlete_id`, `event_group_id`, `created_at`
- Many-to-many: athletes can belong to multiple event groups

**`superpower_presets` and `kryptonite_presets` (new):**
- `id`, `label`, `display_order`, `created_at`
- Configurable preset lists

**`athlete_superpowers` and `athlete_kryptonite` (new):**
- `athlete_id`, `preset_id` (nullable), `custom_text` (for non-preset items), `detail` (optional), `display_order`, `created_at`
- Multiple items per athlete; either preset or custom, with optional detail

**`athlete_archetypes` (new):**
- `athlete_id`, `rsi_type` (elastic|force|high_rsi|low_rsi|unset), `sprint_archetype` (bouncer|spinner|bounder|driver|unset), `force_velocity_scale` (1–5 or null)
- One row per athlete; all coach-assigned (qualitative)

**`athlete_flags` (new):**
- `athlete_id`, `flag_type` (system|coach), `title`, `description` (optional), `session_id` (optional), `metric_key` (optional), `created_by`, `created_at`, `resolved_at` (nullable)
- System-suggested and coach-added flags; optional session/metric linkage for validation

**`athlete_notes` (existing):**
- Unchanged; continues to store general coach notes

**Migrations:**
- Migration scripts for new tables and `active` column

---

## 3. Events & Participation

**Primary: coach-assigned event groups**

- Configurable event groups (sprints, horizontal-jumps, distance, hurdles, throws, etc.)
- Athletes can belong to multiple groups (e.g. sprinter + hurdler)

**Secondary: inferred from entries**

- Show which metrics the athlete has entries for (grouped by category)
- Identify gaps: missing data in key metrics the rest of the team was assessed on (e.g. absence, or distance group doing separate workouts)

---

## 4. Dashboard Content & Data Flow

**Per-athlete dashboard sections**

1. **Events / event groups** — Coach-assigned groups as chips; edit via multi-select. Below: "Metrics with data" (which metrics have entries). Highlight gaps vs team/common sessions.

2. **Practice-metric PRs** — Best values per metric (from `entries`). Strong/weak areas (top/bottom quartile vs team or event-group). Units from `metrics.json`.

3. **Progression & flags** — Mini progression charts for 2–3 key metrics; link to full progression. System-suggested warnings (declining trend, no data in X days) + coach-added flags with optional session/metric linkage. Resolve/dismiss.

4. **Archetypes** — Three coach-editable fields: RSI type, sprint archetype (James Wild), force–velocity scale (1–5). Dropdowns with "unset" option.

5. **Superpowers / kryptonite** — List of items (preset or custom, optional detail). Add via preset picker or custom text. Same pattern for both.

6. **Coach notes** — Existing `athlete_notes`; keep or embed in dashboard.

**Team overview dashboard**

Same conceptual sections, but aggregated: event-group distribution, team PR leaders per metric, trend summary (rising/declining/flat), archetype distribution, common superpowers/kryptonite, recent notes across team.

**Data flow**

- Team overview: `/api/athletes?active=true`, `/api/team-overview` (aggregated)
- Athlete view: `/api/athletes/[id]/dashboard` (or separate endpoints per section)
- SWR for client caching; server components where appropriate

---

## 5. APIs & Error Handling

**New API routes**

| Route | Method | Purpose |
|-------|--------|---------|
| `PUT /api/athletes/[id]` | PUT | Update athlete (including `active`) |
| `GET /api/athletes/[id]/dashboard` | GET | Full dashboard payload |
| `GET /api/team-overview` | GET | Team-level stats (active athletes only) |
| `GET/POST/PUT/DELETE /api/event-groups` | - | CRUD event groups |
| `GET/POST/DELETE /api/athletes/[id]/event-groups` | - | Assign/remove event groups |
| `GET/POST/PUT/DELETE /api/superpower-presets` | - | CRUD superpower presets |
| `GET/POST/PUT/DELETE /api/kryptonite-presets` | - | CRUD kryptonite presets |
| `GET/PUT /api/athletes/[id]/archetypes` | - | Read/update archetypes |
| `GET/POST/DELETE /api/athletes/[id]/superpowers` | - | List/add/remove superpowers |
| `GET/POST/DELETE /api/athletes/[id]/kryptonite` | - | List/add/remove kryptonite |
| `GET/POST /api/athletes/[id]/flags` | - | List flags; add coach flag; resolve/dismiss |
| `GET /api/athletes/[id]/prs` | GET | PRs per metric |

All write routes require auth. Reads follow existing rules (coach-only or public for leaderboard-style views).

**Error handling**

- Auth: 401 for unauthenticated writes; redirect to login
- Validation: 400 with `{ error: string }`
- Not found: 404 for missing athlete/event-group/preset
- Server errors: 500 with generic message; log details server-side
- Client: Toast or inline messages; retry where useful

**System flags**

Computed on-demand when loading dashboard or team overview (no separate cron in v1). Logic: declining over last N sessions, no entries in X days, etc.

---

## 6. Component Architecture & Phasing

**Component structure**

- **`AthletesPage`** — Server component; auth + layout shell. Renders `AthletesClient` (client) with sidebar + main.
- **`AthletesSidebar`** — Add-athlete, roster (grouped by class, Active checkbox), "Manage Event Groups", "Manage Presets", Settings link.
- **`AthleteRoster`** — Reused/adapted; roster list with grouping, selection, active toggle.
- **`TeamOverviewDashboard`** — Team-level summaries when no athlete selected.
- **`AthleteDashboard`** — Per-athlete view; section cards: Events, PRs, Progression & Flags, Archetypes, Superpowers/Kryptonite, Notes.
- **Dialogs / panels** — Add-athlete, Manage Event Groups, Manage Presets, Notes (existing or inline).
- **`SettingsPage`** (`/settings`) — Full management for event groups, superpower presets, kryptonite presets; foundation for future config expansion.

Shared: `PageBackground`, form primitives, loading/error states. Preserve existing cyberpunk theme.

**Implementation phases**

| Phase | Scope |
|-------|-------|
| **A** | Schema migrations, `active` flag, sidebar layout, team overview placeholder, athlete selection |
| **B** | Event groups (CRUD, assignment), Events section on athlete dashboard |
| **C** | PRs, progression mini-charts, system + coach flags |
| **D** | Archetypes, superpowers/kryptonite (presets + assignment) |
| **E** | Team overview populated with real data, Settings page, polish |

Phase A delivers the new layout and selection flow; later phases add features incrementally.

---

## Summary Checklist

| Area | Key Items |
|------|-----------|
| Layout | Sidebar (add-athlete, roster with Active checkbox, Manage Event Groups/Presets) + main (team overview or athlete dashboard) |
| Schema | `active` on athletes; `event_groups`, `athlete_event_groups`; superpower/kryptonite presets + athlete items; `athlete_archetypes`; `athlete_flags` |
| Events | Coach-assigned event groups (many-to-many); inferred metrics from entries; gap detection vs team |
| Dashboard | Events, PRs, Progression & Flags, Archetypes, Superpowers/Kryptonite, Notes |
| Flags | System-suggested (declining, missing data) + coach-added with optional session/metric linkage |
| Settings | Hybrid: quick links on athletes page + dedicated `/settings` route |
| Phasing | A → B → C → D → E |

This design is ready for implementation planning.
