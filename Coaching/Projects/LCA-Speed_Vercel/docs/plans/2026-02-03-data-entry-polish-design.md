# Data Entry Page Polish — Design

**Date:** 2026-02-03  
**Status:** Validated  
**Scope:** Layout, special sessions, athlete selector, day-metrics search, mobile splits.

---

## 1. Page layout and sidebar

**Structure**

- **Desktop:** Two-column layout. **Main content** (center/right) is the **Add Entry** form (session picker, athlete, metric, value, submit). **Sidebar** (left, fixed width ~280–320px) contains:
  - **New session** — existing SessionForm (date, phase, phase_week, day metrics, etc.).
  - **Recent sessions** — existing list of recent sessions (e.g. last 20).
- **Mobile:** Main area remains Add Entry by default. Sidebar is an **expandable panel** (e.g. “Session” or “Setup” button or hamburger opening a drawer/sheet from left or bottom). When open: New session + Recent sessions; when closed: full screen is Add Entry.

**Components**

- Data Entry page composes:
  - **DataEntrySidebar** (or SessionSidebar): SessionForm + RecentSessionsList.
  - **EntryForm** as main focus.
- Responsive: sidebar visible by default on `md+`, hidden on smaller; toggle (button + state) to open/close on small screens. Optionally persist “sidebar open” in sessionStorage for the visit.
- Header unchanged (title, Athletes, Home). Sidebar toggle near header on mobile.

---

## 2. Special sessions (phase “Other”)

**Phase “Other”**

- Add **“Other”** to the phase list (e.g. last: Preseason, Preparation, Competition, Championship, **Other**). No new DB column; `phase` remains a string.

**Phase week when phase is Other (Option B)**

- When user selects **Other**, **hide** the phase_week field in the UI. Client sends `phase_week: 0` so the API still receives a value. No “week 0” shown to the user.

**API and validation**

- **POST /api/sessions:** Accept `phase_week === 0` (e.g. when `phase === "Other"`). Validate `phase_week` in range **0–5** (was 1–5).
- **GET /api/sessions** and **Recent sessions:** Display Other sessions normally. For Other with phase_week 0, display as “Other” or “Other (N/A)” (optional; avoid “Other week 0” in UI).
- Leaderboard/historical: no change; “Other” and week 0 are just another bucket if views group by phase/week.

**Summary:** Phase “Other”; when Other is selected, hide phase_week in form and send 0; API accepts 0–5 for phase_week. No DB migration.

---

## 3. Athlete selector (Active-only + autocomplete)

**Active-only toggle**

- Checkbox or toggle **“Active only”** (default **on**) above or beside the athlete control. When on, list and search are limited to `active === true`; when off, show all athletes.
- Data: use GET `/api/athletes` and GET `/api/athletes?active=true` (e.g. two SWR keys or one fetch per mode). Existing API suffices.

**Type-to-search / autocomplete**

- Replace athlete `<select>` with a **combobox**: text input + dropdown. User types (first or last name); list filters by substring match (case-insensitive). Arrow keys or tap to select; Enter or tap sets athlete and closes list. Selected athlete’s full name shown when closed.
- Start with controlled input + filtered dropdown; add headless combobox (e.g. Radix) if we want full ARIA/keyboard support.
- “Active only” applies to the list the combobox filters over. Submit still sends `athlete_id` as today.

---

## 4. Day-metrics search

- In **SessionForm**, above the “Day metrics” checkbox list, add a **search/filter** input (placeholder e.g. “Search metrics…”).
- Filter the visible metrics by `label` (display_name) containing the query (case-insensitive). Checkboxes unchanged; only visible rows change.
- When search is empty, show all metrics (remove or relax “first 50” cap so search is useful). Keep list in a scrollable container with sensible max-height. Client-side only; no API change.

---

## 5. Mobile splits (hybrid + comma)

**When to show multiple inputs vs single field**

- **Cumulative metrics:** On **mobile** (e.g. viewport &lt; 768px), show **one input per split** (“Split 1”, “Split 2”, …) using session split count or metric default. Each input `inputMode="decimal"`. On **desktop**, keep **single** Value field with pipe-separated format.
- **Non-cumulative** (single_interval, paired_components): single value field everywhere.

**Submitting multiple inputs**

- In multi-input mode for cumulative, on submit join values with `|` and send as `raw_input` so existing API/parser see same format as desktop.

**Comma as separator (all devices)**

- In the **entries** parser (backend), treat **comma** as alternative to pipe: e.g. split on `[|,]` or normalize commas to `|` before parsing. So `0.95,1.85,2.65` and `0.95|1.85|2.65` are equivalent. Mention in hint text (“pipe or comma separated”).

**Summary:** Mobile = multiple inputs per split for cumulative, joined with `|` on submit. Desktop = single pipe field. Parser accepts comma as well as pipe everywhere.

---

## Implementation order

1. **Special sessions** — Add “Other” phase, hide phase_week when Other, API accept 0–5. Small, isolated.
2. **Day-metrics search** — Filter input in SessionForm; client-side filter. Isolated.
3. **Parser comma support** — Backend split on comma or pipe. Enables better mobile UX and desktop flexibility.
4. **Mobile splits UI** — Multiple inputs for cumulative on small viewport; combine with `|` on submit.
5. **Layout and sidebar** — Two-column desktop, expandable sidebar on mobile; move SessionForm + RecentSessionsList into sidebar.
6. **Athlete selector** — “Active only” toggle + combobox with type-to-search; two fetches or filter from full list.

Items 1–2 can be done in parallel; 3 before 4. Layout (5) can be done before or after athlete selector (6).
