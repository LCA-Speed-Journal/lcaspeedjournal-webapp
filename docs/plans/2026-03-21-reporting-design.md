# Reporting: Export + In-App Summary (Date Range)

**Date:** 2026-03-21  
**Goal:** After completing the Preseason Phase, enable coaches to **pull structured data** and **see participation and performance** over any calendar window: full-datapoint **CSV export** and an **in-app summary** (team + individual athletes), without tying filters to training phase.

---

## 1. Decisions and Success Criteria

**Filter**

- **Calendar date range only:** `from` and `to` (`YYYY-MM-DD`), independent of `sessions.phase`. This maximizes flexibility; phase remains available as **columns/metadata** in export and joins for later analysis.

**Export**

- **CSV** download: one row per **entry** (datapoint), with metric, athlete, marks, repetition (`interval_index`), component, units, session context, and identifiers.

**In-app summary**

- **Participation and volume:** sessions touched, entry counts, who participated, attempts per metric.
- **Performance aggregates:** per metric key, team-wide and per athlete: count, min, max, average, median on `display_value` (within the same `metric_key`).

**Access**

- **Public** (no login), consistent with leaderboard and historical read-only views. **Trade-off:** row-level CSV is downloadable by anyone who can reach the app; revisit (e.g. auth on export only) if policy changes.

**Success criteria**

- Coach selects a range and sees team-level and athlete-level summary in one place.
- One action downloads a CSV suitable for Excel/Sheets or scripts.
- Implementation reuses existing patterns: `sessions.session_date` filtering (as in historical API), metric registry for human-readable labels.

---

## 2. APIs, Queries, and CSV Shape

**Endpoints (GET, public)**

| Endpoint | Response |
|----------|----------|
| `GET /api/reporting/export?from=&to=` | `text/csv`, attachment |
| `GET /api/reporting/summary?from=&to=` | JSON summary |

**Validation**

- Require `from` and `to`. Reject missing/invalid dates or `from > to` with **400** and a clear `error` message.
- Optional: **maximum range length** (e.g. 24 months) to protect the database.
- Optional: **maximum export rows** (or a preliminary `COUNT`); if exceeded, return **413** or **400** with guidance to narrow the range.

**Export query**

- `entries`  
  `INNER JOIN sessions s` on `session_id` with `s.session_date BETWEEN from AND to`  
  `INNER JOIN athletes` for names and metadata.
- `ORDER BY s.session_date, athlete sort name, metric_key, interval_index NULLS LAST, component NULLS LAST`.
- Parameterized SQL only (existing `sql` tagged templates).

**CSV columns (suggested)**

- `session_date`, `session_id`, `phase` (from session)
- `athlete_id`, `first_name`, `last_name`, `gender`, `athlete_type`
- `metric_key`, `metric_label` (from `getMetricsRegistry()` at export time)
- `interval_index`, `component`, `value`, `display_value`, `units`, `raw_input`
- `entry_id`, `created_at`

**Encoding:** UTF-8; RFC-style quoting for fields containing commas or quotes. **Header row always present**, including when there are zero data rows.

**Filename:** e.g. `lcaspeed-export_<from>_<to>.csv` via `Content-Disposition: attachment`.

**Summary JSON**

- **Team:** distinct `session_id` (sessions with ≥1 entry), distinct `athlete_id`, total entries, per-`metric_key` attempt counts; optional team-level aggregates per metric (min/max/avg/median on `display_value`).
- **Per athlete:** entry counts, sessions represented, and per `(athlete_id, metric_key)` aggregates: `n`, min, max, avg, median (`percentile_cont(0.5)` in PostgreSQL where appropriate).
- Document that aggregates are **within a single `metric_key`** (same units by definition in registry).

**Performance**

- Log queries exceeding a threshold (e.g. 2s). Confirm indexes on `sessions(session_date)` and `entries(session_id)` as needed (`EXPLAIN` during implementation).

---

## 3. UI

**Route**

- **`/reporting`** (or `/reports`—choose one; link from the same navigation as Leaderboard / Historical).

**Controls**

- **`from` / `to`** date inputs; align with Historical page patterns (reuse shared controls if they exist).
- Load summary on **Apply** or on change with debounce.
- **Download CSV** triggers `GET /api/reporting/export?from=&to=` and starts a browser download (do not hold full CSV in React state).

**Layout**

1. **Team overview** — sessions with data, total entries, unique athletes; metrics used with attempt counts (sortable or ordered by volume).
2. **Athletes** — sortable table (name, entry count, sessions); **select athlete** to show per-metric stats (n, min, max, avg, median), or expand row—avoid an overwhelming single table.

**States**

- Loading and errors consistent with Historical.
- Empty range: clear copy; CSV may still return headers only.

**Mobile**

- Horizontal scroll for wide tables; primary actions remain reachable.

---

## 4. Errors, Limits, and Testing

**Errors**

- **400** — bad/missing dates, inverted range, range too long.
- **413/400** — export would exceed row cap.
- **500** — server/database; generic message client-side, details in logs.

**Tests**

- Unit: date validation, range cap, CSV escaping (including `raw_input` with quotes).
- Integration/fixture: small dataset across two dates; assert summary counts and export row count.

---

## 5. Implementation Order (Suggested)

1. **`/api/reporting/export`** — CSV + tests.
2. **`/api/reporting/summary`** — JSON + tests.
3. **`/reporting` page** — date range, team block, athlete table + detail, download button.
4. **Nav link** and smoke test in production-like env.

---

## 6. Follow-Up (Out of Scope for v1)

- Auth-gated export only.
- Excel (`.xlsx`) export.
- Pre-built “phase reports” or saved report presets.
- Cross-metric analytics or percentiles beyond per-`metric_key` aggregates.
