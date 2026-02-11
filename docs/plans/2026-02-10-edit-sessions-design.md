# Edit Sessions — Design

**Date:** 2026-02-10  
**Status:** Validated  
**Scope:** In-app editing of session metadata and entries (add, edit with raw or override, delete). Two entry points: recent sessions clickable and pick-any-session.

---

## 1. Overview and entry points

**Goal:** A single “Edit session” experience where users can change session metadata and manage entries (add, edit with raw or override, delete). Access in two ways:

- **From Data Entry sidebar:** Each item in “Recent sessions” is clickable (e.g. “Edit” or click the row). Clicking opens the edit view for that session (same page or a dedicated route).
- **Pick any session:** A control such as “Edit another session…” or “Pick session by date” lets the user choose a session (e.g. from a list or date picker) and open the same edit view.

**Edit view contents:**

- **Session block:** Editable fields for date, phase, phase week, day metrics (checkboxes), day splits (for cumulative metrics), session notes. Save updates the session row.
- **Entries block:** List of entries for that session (athlete, metric, value/units, raw_input). Per row: Edit (inline or modal with raw + override), Delete (with confirmation). “Add entry” reuses the same flow as the main Add Entry form but scoped to this session.

**APIs to add:**

- **Sessions:** `GET /api/sessions/[id]` (single session), `PATCH /api/sessions/[id]` (update metadata). Optional later: `DELETE /api/sessions/[id]` (cascade to entries) if we want “delete session” in-app.
- **Entries:** `GET /api/entries?session_id=...` (list entries for a session), `PATCH /api/entries/[id]` (update one entry: accept either raw_input re-parse or explicit value/display_value/units), `DELETE /api/entries/[id]` (remove one entry). Add entry uses existing POST.

**Route:** A dedicated route for the edit view, e.g. `/data-entry/session/[id]` or `/data-entry/edit/[id]`, so “Edit” from the sidebar or from “pick session” both go to the same page with the session id in the URL.

---

## 2. Session block and entries block

**Session block (top of edit view)**

- **Fields:** Session date (date input), Phase (select), Phase week (number 0–5; hidden when Phase is Other, send 0). Day metrics: same checkbox list + search as in SessionForm. For each selected cumulative metric, same splits input(s) (desktop: single pipe/comma field; mobile: one input per split). Session notes: textarea.
- **Load:** On open, GET the session by id and prefill all fields. If the session has `day_metrics` / `day_splits`, use them to set checkboxes and split inputs.
- **Save:** “Save session” sends PATCH to `/api/sessions/[id]` with the same shape as POST (session_date, phase, phase_week, day_metrics, day_splits, session_notes). Validation mirrors POST (required fields, phase_week 0–5). On success: show brief success, stay on page. On 4xx/5xx: show error message, keep form state.
- **Delete session:** Out of scope for initial release; can add later if needed.

**Entries block (below session block)**

- **List:** GET `/api/entries?session_id=<id>`. Show a table or card list: athlete name, metric label, display value + units, optional raw_input (e.g. in details/expand). Order by athlete name then metric (or metric then athlete—pick one). Empty state: “No entries yet. Add one below.”
- **Add entry:** Session fixed to current session; athlete combobox (active-only toggle), metric select, value field(s) with hint. Submit POST to existing `/api/entries`. On success, refetch entries list and optionally clear the add form.
- **Edit entry (per row):** “Edit” opens inline or a small modal. Two ways to change the value:
  - **Raw:** One field for raw input (prefilled with existing `raw_input`). On save, backend re-parses (same parser as POST) and updates value, display_value, units, raw_input for that entry. For “edit one entry” we update only that entry’s id (single-row update).
  - **Override:** Optional fields: display value (number), units. If provided, they overwrite stored display_value and units; value can be derived or left for audit. Backend PATCH accepts either `raw_input` (re-parse) or `display_value` + `units` (override); if both sent, override wins.
- **Delete entry:** “Delete” with short confirmation (“Remove this entry?”). On confirm, DELETE `/api/entries/[id]`. Refetch entries list.

**Refetch / cache:** After any mutation (session save, add entry, edit entry, delete entry), invalidate or refetch the session and entries so the page stays in sync (e.g. SWR mutate for session and entries keys).

---

## 3. APIs and error handling

**GET /api/sessions/[id]**

- Returns one session: id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at. Serialize dates as in existing GET (session_date YYYY-MM-DD, created_at ISO).
- 404 if not found. 500 on DB error. Auth: match existing GET sessions (public or auth as you do today).

**PATCH /api/sessions/[id]**

- Auth required. Body: same as POST (session_date, phase, phase_week, day_metrics, day_splits, session_notes); all optional, validate when present (e.g. phase_week 0–5). Partial update.
- 400 for validation errors. 404 if not found. 500 on DB error. Response: updated session object.

**GET /api/entries?session_id=&lt;uuid&gt;**

- Query: session_id required. Returns array of entries for that session. Each entry: id, session_id, athlete_id, metric_key, interval_index, component, value, display_value, units, raw_input, and optionally created_at. Include athlete first/last name (join or second query) so the UI can show names without extra fetches.
- 400 if session_id missing or invalid. 404 optional (or empty array) when session has no entries. 500 on DB error. Auth: match sessions if you want edit-only access.

**PATCH /api/entries/[id]**

- Auth required. Body: (1) raw_input only → re-parse with existing parser and session day_splits/day_components, then update that single entry’s value, display_value, units, raw_input (when parser returns multiple rows for one metric, update only the row for this id); or (2) display_value and/or units (override) → update those columns; optionally value for audit. If both raw_input and override sent, override wins for display_value/units.
- 400 for unknown metric, parse failure, or invalid numbers. 404 if entry not found. 500 on DB error. Response: updated entry object.

**DELETE /api/entries/[id]**

- Auth required. Deletes the entry by id. 404 if not found. 204 No Content or 200 with { deleted: true }. 500 on DB error.

**Client-side**

- On 4xx: show API error message. On 5xx or network error: generic “Something went wrong,” optionally retry. Keep form state on error so the user can correct and resubmit.

---

## 4. Testing and implementation order

**Testing**

- **API:** Add or extend tests for the new routes: GET session by id (200, 404); PATCH session (200, 400, 404); GET entries by session_id (200 with array, 400); PATCH entry with raw_input; PATCH entry with display_value/units override; DELETE entry (204/200, 404). Use existing stack (e.g. Vitest + fetch). No UI tests required unless already in use.
- **Manual:** After implementation: open edit from recent session; open edit via “pick session”; change session date/phase/notes and save; add entry; edit entry via raw; edit entry via override; delete entry; confirm leaderboard/historical reflect changes after refetch.

**Implementation order**

1. **Backend:** GET /api/sessions/[id], PATCH /api/sessions/[id], GET /api/entries?session_id=, PATCH /api/entries/[id], DELETE /api/entries/[id]. Reuse session serialization and entry parsing/validation. Add or extend API tests.
2. **Edit route and session block:** Add route /data-entry/session/[id] (or /data-entry/edit/[id]). Page loads session by id and entries. Session block: form prefill, “Save session” → PATCH, error/success, refetch.
3. **Entries list and add entry:** Entries block: fetch entries (with athlete names), render list. “Add entry” form (session fixed to current id): reuse EntryForm logic or shared component; POST then refetch entries.
4. **Edit and delete entry:** Per-row “Edit” (raw + override UI), “Delete” with confirm. Wire to PATCH and DELETE; refetch entries after each mutation.
5. **Entry points:** In Data Entry sidebar, make each recent session clickable (link to /data-entry/session/[id]). Add “Edit another session…” (or “Pick session”) to choose a session then navigate to that session’s edit URL.

Optional polish: loading states, optimistic updates, or “Unsaved changes” when leaving with dirty session form. Out of scope: delete entire session (add later if needed).
