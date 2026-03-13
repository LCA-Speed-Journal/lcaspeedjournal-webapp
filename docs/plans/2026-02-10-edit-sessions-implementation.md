# Edit Sessions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add in-app editing of session metadata and entries (add, edit with raw or override, delete). Two entry points: recent sessions clickable and pick-any-session. Dedicated route `/data-entry/session/[id]`.

**Architecture:** New API routes: GET/PATCH `/api/sessions/[id]`, GET `/api/entries?session_id=`, PATCH/DELETE `/api/entries/[id]`. Reuse `parseEntry` for raw re-parse; add override logic for `display_value`/`units`. Edit page is a client component that loads session + entries via SWR, renders SessionForm-like block (editable) and entries table with add/edit/delete. Entry points: link each recent session to edit URL; add "Edit another session…" control with session picker.

**Tech Stack:** Next.js App Router, Vercel Postgres (`sql`), SWR, React, Tailwind CSS, Vitest (API tests). No new dependencies.

**Design reference:** `docs/plans/2026-02-10-edit-sessions-design.md`

---

## Task 1: GET /api/sessions/[id]

**Files:**
- Create: `src/app/api/sessions/[id]/route.ts`
- Test: `src/app/api/sessions/[id]/route.test.ts` (optional; manual verification in Task 2)

**Step 1: Create the route file**

Create `src/app/api/sessions/[id]/route.ts`:

```ts
/**
 * Sessions API - GET single session by id.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

function serializeSessionRow(row: Record<string, unknown>) {
  return {
    ...row,
    session_date:
      row.session_date instanceof Date
        ? row.session_date.toISOString().slice(0, 10)
        : row.session_date,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { rows } = await sql`
      SELECT id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
      FROM sessions
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ data: serializeSessionRow(rows[0] as Record<string, unknown>) });
  } catch (err) {
    console.error("GET /api/sessions/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `cd "c:\Users\rossp\OneDrive\Documents\Python Scripts\2026 Coding\lcaspeedjournal-webapp-clean" && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/sessions/[id]/route.ts
git commit -m "feat(api): add GET /api/sessions/[id]"
```

---

## Task 2: PATCH /api/sessions/[id]

**Files:**
- Modify: `src/app/api/sessions/[id]/route.ts`
- Reference: `src/app/api/sessions/route.ts` (POST validation)

**Step 1: Add PATCH handler**

In `src/app/api/sessions/[id]/route.ts`, add imports and PATCH handler. Reuse validation logic from `route.ts` POST (session_date, phase, phase_week 0–5, day_metrics, day_splits, session_notes). Auth required. Partial update: only send provided fields.

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ... after GET ...

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { session_date, phase, phase_week, day_metrics, day_splits, session_notes } = body;

    // Validate phase_week if present
    if (phase_week != null) {
      const week = Number(phase_week);
      if (Number.isNaN(week) || week < 0 || week > 5) {
        return NextResponse.json(
          { error: "phase_week must be between 0 and 5" },
          { status: 400 }
        );
      }
    }

    const dayMetricsJson =
      Array.isArray(day_metrics) && day_metrics.length > 0
        ? JSON.stringify(day_metrics)
        : day_metrics === undefined ? undefined : null;
    let daySplitsJson: string | null | undefined = undefined;
    if (day_splits !== undefined) {
      daySplitsJson = null;
      if (
        day_splits != null &&
        typeof day_splits === "object" &&
        !Array.isArray(day_splits)
      ) {
        const sanitized: Record<string, number[]> = {};
        for (const [k, v] of Object.entries(day_splits)) {
          if (Array.isArray(v) && v.every((n) => typeof n === "number" && n > 0)) {
            sanitized[k] = v as number[];
          }
        }
        if (Object.keys(sanitized).length > 0) {
          daySplitsJson = JSON.stringify(sanitized);
        }
      }
    }

    // Build dynamic UPDATE
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (session_date !== undefined) {
      updates.push(`session_date = $${idx++}`);
      values.push(String(session_date));
    }
    if (phase !== undefined) {
      updates.push(`phase = $${idx++}`);
      values.push(String(phase));
    }
    if (phase_week !== undefined) {
      updates.push(`phase_week = $${idx++}`);
      values.push(phase === "Other" ? 0 : Number(phase_week));
    }
    if (dayMetricsJson !== undefined) {
      updates.push(`day_metrics = $${idx++}`);
      values.push(dayMetricsJson);
    }
    if (daySplitsJson !== undefined) {
      updates.push(`day_splits = $${idx++}`);
      values.push(daySplitsJson);
    }
    if (session_notes !== undefined) {
      updates.push(`session_notes = $${idx++}`);
      values.push(session_notes ?? null);
    }

    if (updates.length === 0) {
      // Fetch and return current
      const { rows } = await sql`SELECT id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at FROM sessions WHERE id = ${id} LIMIT 1`;
      if (!rows.length) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ data: serializeSessionRow(rows[0] as Record<string, unknown>) });
    }

    // Use parameterized query via sql template
    const result = await sql`
      UPDATE sessions
      SET ${sql.unsafe(updates.join(", "))}
      WHERE id = ${id}
      RETURNING id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
    `;
```

**Approach:** Require full body from client (same shape as POST). Client sends all fields; we validate and run a single UPDATE. Matches design: "same shape as POST".

**Step 1 (revised): PATCH with full-body update**

Client sends full session shape. Validate same as POST. Run single UPDATE with all columns.

Add to `src/app/api/sessions/[id]/route.ts`:

```ts
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await getServerSession(authOptions);
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      session_date,
      phase,
      phase_week,
      day_metrics,
      day_splits,
      session_notes,
    } = body;

    if (!session_date || !phase || phase_week == null) {
      return NextResponse.json(
        { error: "Missing required fields: session_date, phase, phase_week" },
        { status: 400 }
      );
    }

    const week = Number(phase_week);
    if (Number.isNaN(week) || week < 0 || week > 5) {
      return NextResponse.json(
        { error: "phase_week must be between 0 and 5" },
        { status: 400 }
      );
    }

    const dayMetricsJson =
      Array.isArray(day_metrics) && day_metrics.length > 0
        ? JSON.stringify(day_metrics)
        : null;
    let daySplitsJson: string | null = null;
    if (
      day_splits != null &&
      typeof day_splits === "object" &&
      !Array.isArray(day_splits)
    ) {
      const sanitized: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(day_splits)) {
        if (Array.isArray(v) && v.every((n) => typeof n === "number" && n > 0)) {
          sanitized[k] = v as number[];
        }
      }
      if (Object.keys(sanitized).length > 0) {
        daySplitsJson = JSON.stringify(sanitized);
      }
    }
    const notes = session_notes ?? null;

    const { rows } = await sql`
      UPDATE sessions
      SET
        session_date = ${String(session_date)},
        phase = ${String(phase)},
        phase_week = ${week},
        day_metrics = ${dayMetricsJson},
        day_splits = ${daySplitsJson},
        session_notes = ${notes}
      WHERE id = ${id}
      RETURNING id, session_date, phase, phase_week, day_metrics, day_splits, session_notes, created_at
    `;

    if (!rows.length) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: serializeSessionRow(rows[0] as Record<string, unknown>),
    });
  } catch (err) {
    console.error("PATCH /api/sessions/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
```

Add import for `getServerSession` and `authOptions`.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/sessions/[id]/route.ts
git commit -m "feat(api): add PATCH /api/sessions/[id]"
```

---

## Task 3: GET /api/entries?session_id=

**Files:**
- Modify: `src/app/api/entries/route.ts` — add GET handler
- Or create: `src/app/api/entries/route.ts` already has POST only; add GET

**Step 1: Add GET handler to entries route**

In `src/app/api/entries/route.ts`, add GET before POST:

```ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    if (!sessionId || sessionId.trim() === "") {
      return NextResponse.json(
        { error: "session_id query parameter is required" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      SELECT e.id, e.session_id, e.athlete_id, e.metric_key, e.interval_index, e.component,
             e.value, e.display_value, e.units, e.raw_input, e.created_at,
             a.first_name, a.last_name
      FROM entries e
      JOIN athletes a ON a.id = e.athlete_id
      WHERE e.session_id = ${sessionId}
      ORDER BY a.last_name, a.first_name, e.metric_key, e.interval_index NULLS LAST, e.component NULLS LAST
    `;

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/entries:", err);
    return NextResponse.json(
      { error: "Failed to fetch entries" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/entries/route.ts
git commit -m "feat(api): add GET /api/entries?session_id="
```

---

## Task 4: PATCH /api/entries/[id]

**Files:**
- Create: `src/app/api/entries/[id]/route.ts`
- Reference: `src/lib/parser.ts` (parseEntry), `src/app/api/entries/route.ts` (POST)

**Step 1: Create PATCH handler**

Create `src/app/api/entries/[id]/route.ts` with auth check. Implement two paths:

**Path A — Override (display_value and/or units):** If body has `display_value` or `units`, UPDATE entry SET those columns. Optionally update `value` for audit (can set value = display_value). If both raw_input and override sent, override wins for display_value/units per design.

**Path B — Raw re-parse (raw_input only, or when override not provided):** Fetch entry by id (need metric_key, interval_index, component). Fetch session day_splits, day_components. Call `parseEntry(metric_key, raw_input, { day_splits, day_components })`. Find parsed row matching entry's interval_index and component (for single_interval, use first row). UPDATE entry SET value, display_value, units, raw_input from that parsed row.

```ts
// Pseudocode
if (display_value !== undefined || units !== undefined) {
  // Override path: UPDATE display_value, units (and optionally value)
  await sql`UPDATE entries SET display_value = ${...}, units = ${...} WHERE id = ${id} RETURNING ...`;
} else if (raw_input != null && raw_input !== "") {
  // Raw path: fetch entry, session, parse, match, update
  const entry = await fetchEntry(id);
  const session = await fetchSession(entry.session_id);
  const parsed = parseEntry(entry.metric_key, raw_input, { day_splits: session.day_splits, day_components: session.day_components });
  const match = parsed.find(p => p.interval_index === entry.interval_index && (p.component ?? null) === (entry.component ?? null)) ?? parsed[0];
  await sql`UPDATE entries SET value = ${match.value}, display_value = ${match.display_value}, units = ${match.units}, raw_input = ${raw_input} WHERE id = ${id} RETURNING ...`;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/entries/[id]/route.ts
git commit -m "feat(api): add PATCH /api/entries/[id] for raw and override"
```

---

## Task 5: DELETE /api/entries/[id]

**Files:**
- Modify: `src/app/api/entries/[id]/route.ts`

**Step 1: Add DELETE handler**

In `src/app/api/entries/[id]/route.ts`, add:

```ts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { rowCount } = await sql`DELETE FROM entries WHERE id = ${id}`;
    // Vercel Postgres may not return rowCount; use RETURNING to check
    const { rows } = await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`;
    if (!rows.length) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/entries/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
```

Fix: delete once, check result. Vercel Postgres `sql` returns `{ rows }`. Use:

```ts
const { rows } = await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`;
if (!rows.length) {
  return NextResponse.json({ error: "Entry not found" }, { status: 404 });
}
return new NextResponse(null, { status: 204 });
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/entries/[id]/route.ts
git commit -m "feat(api): add DELETE /api/entries/[id]"
```

---

## Task 6: Edit route page shell

**Files:**
- Create: `src/app/data-entry/session/[id]/page.tsx`
- Modify: `src/app/data-entry/page.tsx` (import pattern if needed)

**Step 1: Create dynamic route page**

Create `src/app/data-entry/session/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageBackground } from "@/app/components/PageBackground";
import { DataEntryLayout } from "../../DataEntryLayout";
import { EditSessionClient } from "./EditSessionClient";

export const dynamic = "force-dynamic";

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/data-entry");
  }

  const { id } = await params;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PageBackground />
      <DataEntryLayout
        sidebar={<EditSessionSidebar sessionId={id} />}
        main={<EditSessionClient sessionId={id} />}
      />
    </div>
  );
}

function EditSessionSidebar({ sessionId }: { sessionId: string }) {
  return (
    <div className="space-y-4">
      <Link
        href="/data-entry"
        className="text-sm text-accent hover:text-accent-hover"
      >
        ← Back to data entry
      </Link>
      <p className="text-xs text-foreground-muted">
        Editing session {sessionId.slice(0, 8)}…
      </p>
    </div>
  );
}
```

**Step 2: Create EditSessionClient placeholder**

Create `src/app/data-entry/session/[id]/EditSessionClient.tsx`:

```tsx
"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function EditSessionClient({ sessionId }: { sessionId: string }) {
  const { data, error, isLoading } = useSWR(
    `/api/sessions/${sessionId}`,
    fetcher
  );

  if (isLoading) return <p className="text-foreground-muted">Loading session…</p>;
  if (error) return <p className="text-danger">Failed to load session.</p>;
  if (!data?.data) return <p className="text-foreground-muted">Session not found.</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-foreground">Edit session</h2>
      <p className="text-sm text-foreground-muted">
        {data.data.session_date} — {data.data.phase}
      </p>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/data-entry/session/[id]/page.tsx src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat: add edit session route and client shell"
```

---

## Task 7: Session block (editable form)

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`
- Reference: `src/app/data-entry/SessionForm.tsx` (field structure, day metrics, splits)
- Modify: `src/app/data-entry/SessionForm.tsx` — optionally extract shared form fields into a reusable component, or duplicate for edit mode

**Step 1: Add session edit form**

Reuse SessionForm structure: date, phase, phase_week, day metrics (checkboxes + search), day splits for cumulative metrics, session notes. Prefill from `data.data`. "Save session" → PATCH `/api/sessions/${sessionId}` with same shape as POST. On success: mutate SWR key, show brief success. On error: show error, keep form state.

Implement in EditSessionClient: fetch session, render form with controlled inputs. Submit PATCH. Use `useSWRConfig().mutate` to invalidate `/api/sessions/${sessionId}` on success.

**Step 2: Verify build and manual test**

Run: `npm run build`. Open `/data-entry/session/<valid-id>`, change date, save. Expected: success, data persists.

**Step 3: Commit**

```bash
git add src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat: session block editable form with PATCH"
```

---

## Task 8: Entries list and add entry

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`
- Reference: `src/app/data-entry/EntryForm.tsx`

**Step 1: Fetch entries and render list**

Use `useSWR(\`/api/entries?session_id=${sessionId}\`, fetcher)`. Render table: athlete name, metric label, display value + units, raw_input (optional expand). Order matches API (athlete name, metric). Empty state: "No entries yet. Add one below."

**Step 2: Add entry form**

Session fixed to `sessionId`. Reuse EntryForm logic: athlete combobox (active-only toggle), metric select, value field(s). Submit POST `/api/entries` with session_id, athlete_id, metric_key, raw_input. On success: mutate `/api/entries?session_id=${sessionId}`, mutate leaderboard keys, optionally clear add form.

Can either: embed a simplified EntryForm with `sessionId` prop and `onSuccess` callback, or inline the fields. Prefer extracting a shared `EntryFormFields` or passing `sessionId` + `onSuccess` to existing EntryForm.

**Step 3: Verify build and manual test**

Run: `npm run build`. Add entry from edit page. Expected: entry appears in list, leaderboard updates.

**Step 4: Commit**

```bash
git add src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat: entries list and add entry on edit page"
```

---

## Task 9: Edit and delete entry

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`

**Step 1: Per-row Edit (raw + override)**

Each row has "Edit" button. Click opens inline or modal with:
- Tab or toggle: "Raw" vs "Override"
- Raw: single input prefilled with `raw_input`. Save → PATCH with `raw_input`. Backend re-parses.
- Override: display_value (number), units. Save → PATCH with `display_value` and `units`. If both sent, override wins per design.

Implement modal or inline form. On save: PATCH `/api/entries/${entry.id}`, then mutate entries and leaderboard.

**Step 2: Per-row Delete**

"Delete" button. On click: confirm ("Remove this entry?"). On confirm: DELETE `/api/entries/${entry.id}`, mutate entries and leaderboard.

**Step 3: Verify build and manual test**

Run: `npm run build`. Edit entry via raw, edit via override, delete entry. Expected: changes persist, list refreshes.

**Step 4: Commit**

```bash
git add src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat: edit entry (raw/override) and delete entry"
```

---

## Task 10: Entry points — recent sessions clickable

**Files:**
- Modify: `src/app/data-entry/page.tsx` (RecentSessionsList)

**Step 1: Make recent sessions clickable**

In `RecentSessionsList`, wrap each session row in a Link to `/data-entry/session/${s.id}`. Optionally add "Edit" badge or make entire row clickable.

```tsx
import Link from "next/link";

// In the map:
<li key={s.id}>
  <Link
    href={`/data-entry/session/${s.id}`}
    className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm text-foreground hover:border-accent/50 hover:bg-surface-elevated transition-colors"
  >
    <span>
      {formatDate(s.session_date as string | Date)} — {s.phase}
      {Number(s.phase_week) === 0 ? "" : ` week ${s.phase_week}`}
    </span>
    <span className="font-mono text-foreground-muted">Edit</span>
  </Link>
</li>
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/data-entry/page.tsx
git commit -m "feat: make recent sessions clickable to edit"
```

---

## Task 11: Entry points — pick any session

**Files:**
- Modify: `src/app/data-entry/page.tsx` and/or `src/app/data-entry/session/[id]/page.tsx` (sidebar)
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx` or sidebar

**Step 1: Add "Edit another session…" control**

In the edit page sidebar (`EditSessionSidebar` or similar), add:
- "Edit another session…" link or button.
- Opens a session picker: dropdown of recent sessions (fetch from GET /api/sessions) or a "Pick by date" control. On select: navigate to `/data-entry/session/${selectedId}`.

Implement: fetch sessions (SWR or server), render select. On change: `router.push(\`/data-entry/session/${id}\`)`.

**Step 2: Verify build and manual test**

Run: `npm run build`. From edit page, pick another session. Expected: navigates to that session's edit URL.

**Step 3: Commit**

```bash
git add src/app/data-entry/session/[id]/*
git commit -m "feat: add pick session control in edit sidebar"
```

---

## Task 12: API tests (optional)

**Files:**
- Create: `src/app/api/sessions/[id]/route.test.ts`
- Create: `src/app/api/entries/route.test.ts` (GET)
- Create: `src/app/api/entries/[id]/route.test.ts` (PATCH, DELETE)

**Step 1: Add Vitest API tests**

Use `fetch` or a test client to hit the routes. Mock DB if needed, or use a test DB. Per design: "Use existing stack (e.g. Vitest + fetch)." If project has no API test setup, add minimal tests that call the route handlers directly (import and invoke) with mocked request/params.

Example for GET session (if using handler directly):

```ts
import { describe, it, expect, vi } from "vitest";
// Mock sql, getServerSession as needed
```

**Step 2: Run tests**

Run: `npm run test`
Expected: Tests pass.

**Step 3: Commit**

```bash
git add src/app/api/**/*.test.ts
git commit -m "test: add API tests for sessions and entries"
```

---

## Manual verification checklist

After implementation:

1. Open edit from recent session (click row) → lands on edit page.
2. Open edit via "Pick session" → can select and navigate.
3. Change session date/phase/notes, save → success, stays on page.
4. Add entry → appears in list, leaderboard reflects.
5. Edit entry via raw → re-parsed, value updates.
6. Edit entry via override → display_value/units update.
7. Delete entry → removed from list, leaderboard reflects.
8. Leaderboard and historical pages reflect changes after refetch.

---

## Out of scope (per design)

- Delete entire session (add later if needed).
- Optional polish: loading states, optimistic updates, "Unsaved changes" prompt.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-02-10-edit-sessions-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — Dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints.

**Which approach?**
