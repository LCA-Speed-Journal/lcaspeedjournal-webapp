# Weight-Room Preview, Rosters, and Overview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let coaches snapshot a card preview and download one landscape PDF master, assign athletes to one or more Hugo sports (including an AD-list review import), and glance at attendance / best load / outputs / no-shows in a Team Overview-style screen that stays in sync with the existing sport-coach PDF.

**Architecture:** Keep the signed-off HTML `CardPrintView` as the only card layout. Preview is a frozen copy of the editor draft (button to refresh). One-page PDF rasterizes that frozen preview (html-to-image + jsPDF). Multi-sport lives in `athlete_hugo_memberships`; `athletes.hugo_group` is backfilled then treated as a cache of the first membership. Overview reuses `aggregateWeightRoomReport` plus roster members to compute no-shows. Coach PIN on every Weight-Room write. Do not write lifts into `entries`.

**Tech Stack:** Next.js App Router, `sql` tagged templates, NextAuth / `requireCoachSession`, SWR, Vitest, existing `CardPrintView` + print CSS, `@react-pdf/renderer` (team/athlete packets already shipped — do not rebuild cards in it), `html-to-image` + `jspdf` for the one-page card PDF.

**Locked product decisions (2026-08-29 brainstorm):**

- Preview is static; **Update preview** copies the current form. Stale hint if the form changed after the last snapshot.
- Card PDF is **one page** (digital master). Copies still only affect Print.
- AD lists: **every name is reviewed** (link existing or create) before save. No auto-insert.
- An athlete may belong to **more than one** Hugo sport. No season column in v1.
- Overview tiles: attendance, best parsed load, test outputs, rostered no-shows. Default last Mon–Sun local; keep sport + from/to pickers (12-week cap). Same pickers as Reports so the PDF matches the screen.

**Do not:** rewrite `CardPrintView` / `card-print.css`; shrink `HUGO_GROUPS`; store lifts on `entries`; auto-save unreviewed imports; hold PDF bytes in React state.

**Verify after each task:** `npx vitest run` on the files named in that task. Do not `git commit` unless the user asks (this repo has been working uncommitted).

---

### Task 1: Membership table + backfill

**Files:**

- Create: `scripts/migrate-athlete-hugo-memberships.sql`
- Modify: `src/types/weight-room.ts` — add `AthleteHugoMembership`
- Modify: `src/types/index.ts` — `Athlete.hugo_groups?: string[]`

**Step 1: Write the migration**

```sql
-- Safe to re-run. Source of truth for Hugo team rosters (multi-sport).
CREATE TABLE IF NOT EXISTS athlete_hugo_memberships (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  hugo_group TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, hugo_group),
  CONSTRAINT athlete_hugo_memberships_group_check CHECK (
    hugo_group IN (
      'soccer',
      'volleyball',
      'xc',
      'extracurricular',
      'mens_basketball',
      'womens_basketball',
      'track',
      'baseball'
    )
  )
);
CREATE INDEX IF NOT EXISTS idx_athlete_hugo_memberships_group
  ON athlete_hugo_memberships(hugo_group);

INSERT INTO athlete_hugo_memberships (athlete_id, hugo_group)
SELECT id, hugo_group
FROM athletes
WHERE hugo_group IS NOT NULL
ON CONFLICT (athlete_id, hugo_group) DO NOTHING;
```

**Step 2: Add types**

```ts
export type AthleteHugoMembership = {
  athlete_id: string;
  hugo_group: HugoGroup;
  created_at: string;
};
```

On `Athlete` add `hugo_groups?: string[]` (do not remove `hugo_group`).

**Step 3: Apply locally**

Run against app Postgres (`POSTGRES_URL` from `.env.local`), same pattern as `scripts/migrate-weight-room.sql`. Confirm the table exists and a previously grouped athlete has a membership row.

**Step 4: Self-check**

`athletes.hugo_group` CHECK stays. Do not drop that column in this task.

---

### Task 2: `parseRosterPaste` (TDD)

**Files:**

- Create: `src/lib/weight-room/parse-roster-paste.ts`
- Create: `src/lib/weight-room/parse-roster-paste.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseRosterPaste } from "./parse-roster-paste";

describe("parseRosterPaste", () => {
  it("parses Last, First lines", () => {
    const rows = parseRosterPaste("Smith, Jane\nDoe, John");
    expect(rows).toEqual([
      { first_name: "Jane", last_name: "Smith", raw: "Smith, Jane" },
      { first_name: "John", last_name: "Doe", raw: "Doe, John" },
    ]);
  });

  it("parses First Last lines", () => {
    const rows = parseRosterPaste("Jane Smith");
    expect(rows).toEqual([
      { first_name: "Jane", last_name: "Smith", raw: "Jane Smith" },
    ]);
  });

  it("skips blanks and records unparseable lines", () => {
    const rows = parseRosterPaste("\nMadonna\n  ");
    expect(rows[0]).toMatchObject({
      first_name: "",
      last_name: "",
      raw: "Madonna",
      error: "Could not split into first and last name",
    });
  });
});
```

**Step 2: Run tests (expect fail)**

```bash
npx vitest run src/lib/weight-room/parse-roster-paste.test.ts
```

Expected: fail — module missing.

**Step 3: Minimal implementation**

```ts
export type ParsedRosterLine = {
  first_name: string;
  last_name: string;
  raw: string;
  error?: string;
};

export function parseRosterPaste(text: string): ParsedRosterLine[] {
  const out: ParsedRosterLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    if (raw.includes(",")) {
      const [last, ...rest] = raw.split(",");
      const first = rest.join(",").trim();
      const lastName = last.trim();
      if (!first || !lastName) {
        out.push({
          first_name: "",
          last_name: "",
          raw,
          error: "Could not split into first and last name",
        });
        continue;
      }
      out.push({ first_name: first, last_name: lastName, raw });
      continue;
    }
    const parts = raw.split(/\s+/);
    if (parts.length < 2) {
      out.push({
        first_name: "",
        last_name: "",
        raw,
        error: "Could not split into first and last name",
      });
      continue;
    }
    out.push({
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
      raw,
    });
  }
  return out;
}
```

**Step 4: Run tests (expect pass)**

```bash
npx vitest run src/lib/weight-room/parse-roster-paste.test.ts
```

Expected: 3 passed.

---

### Task 3: Membership + import APIs

**Files:**

- Create: `src/app/api/weight-room/rosters/route.ts` — GET `?hugo_group=`, POST `{ athlete_id, hugo_group }`, DELETE via query `athlete_id` + `hugo_group` (or POST body `{ op: "remove" }`). Prefer DELETE with query params.
- Create: `src/app/api/weight-room/rosters/preview/route.ts` — POST `{ hugo_group, text }`
- Create: `src/app/api/weight-room/rosters/commit/route.ts` — POST `{ hugo_group, rows }`
- Modify: `src/app/api/weight-room/stickers/route.ts` — treat “on a Hugo team” as **any membership** (fallback: `athletes.hugo_group` if memberships empty during rollout)
- Modify: `src/app/api/athletes/route.ts` and `src/app/api/athletes/[id]/route.ts` — include `hugo_groups` array on GET
- Modify: `src/app/weight-room/reports/ReportsClient.tsx` — filter athletes with `hugo_groups?.includes(hugoGroup)` (keep `hugo_group ===` as fallback)

**Step 1: Preview contract (no writes)**

Auth `requireCoachSession()`. `isHugoGroup` or 400.

For each `parseRosterPaste` line without `error`, look up active athletes where `lower(first_name)=` and `lower(last_name)=`. Return:

```ts
{
  data: {
    rows: Array<{
      raw: string;
      first_name: string;
      last_name: string;
      error?: string;
      exact_matches: Array<{ id: string; first_name: string; last_name: string }>;
    }>;
  };
}
```

Do **not** INSERT.

**Step 2: Commit contract (review only)**

Body:

```ts
{
  hugo_group: HugoGroup;
  rows: Array<{
    first_name: string;
    last_name: string;
    athlete_id?: string; // link existing
    create?: boolean;    // create then membership
  }>;
}
```

Rules:

- 400 if neither `athlete_id` nor `create`.
- 400 if `create` and (`!first_name` or `!last_name`).
- Create uses existing athlete POST fields: `gender` default `"M"`, `athlete_type` `"athlete"`, `graduating_class` current year + 2 (same default as `AthleteForm`). Coach can edit later on Manage athletes.
- `INSERT INTO athlete_hugo_memberships ... ON CONFLICT DO NOTHING`.
- Optionally set `athletes.hugo_group` if it is currently null (keeps old filters working).
- Return `{ data: { added: number, created: number } }`.

**Step 3: GET roster**

Join memberships ⨝ athletes where `hugo_group = $g` and `active = true`, order last_name.

**Step 4: POST/DELETE single membership**

POST `{ athlete_id, hugo_group }` — 404 missing athlete, 400 invalid group. DELETE same keys.

**Step 5: Stickers**

Replace `athlete.hugo_group == null` 400 with: no rows in `athlete_hugo_memberships` for that athlete **and** `hugo_group` is null.

Sticker **Issue** list: athletes with at least one membership and no active sticker (same as today, but memberships not the scalar column).

**Step 6: Manual verify**

```bash
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/api/weight-room/rosters
```

Logged-out: `401`.

---

### Task 4: Manage athletes — Hugo teams UI

**Files:**

- Create: `src/app/athletes/HugoTeamsSection.tsx`
- Modify: `src/app/athletes/AthleteDashboard.tsx` — render `HugoTeamsSection` under the name header
- Modify: `src/app/athletes/AthleteForm.tsx` — optional multi-select of Hugo groups after create (POST memberships). If that bloats the add form, skip and only use the dashboard section + roster import.

**Step 1: Section behavior**

SWR `GET /api/weight-room/rosters` is per-group; easier: `GET /api/athletes/:id` now returns `hugo_groups`. Checkboxes for all `HUGO_GROUPS` using `HUGO_GROUP_META.label`. Toggle → POST or DELETE membership. Show errors in `text-danger`.

**Step 2: Sidebar link**

In `AthletesSidebar.tsx`, add a small link **Hugo rosters** → `/weight-room/rosters` so Manage athletes can jump to the bulk page.

**Step 3: Browser check**

Open an athlete, tick Extracurricular, refresh, still ticked. Tick a second sport. Both persist.

---

### Task 5: Weight-room Rosters sub-page

**Files:**

- Create: `src/app/weight-room/rosters/page.tsx` — `getServerSession`, `redirect("/login?callbackUrl=/weight-room/rosters")`, `export const dynamic = "force-dynamic"`
- Create: `src/app/weight-room/rosters/RostersClient.tsx`
- Modify: `src/app/weight-room/page.tsx` — hub link **Rosters**

**Step 1: Page layout**

Sport select (all eight groups). Member list from GET roster. Remove button per row.

**Step 2: Import review (required)**

Textarea: paste AD list. Button **Prepare import** → POST preview. Table of rows:

- raw / first / last
- if `exact_matches.length === 1`, preselect that `athlete_id` but still require Confirm
- if 0 matches, default action Create
- if 2+ matches, force a picker (no default)
- Coach can switch to Create or pick another athlete (`GET /api/athletes?active=true`)

Button **Confirm import** → POST commit with the chosen actions only. Then `mutate` roster. Never commit on Prepare.

**Step 3: Empty copy**

“No one on this roster yet. Paste a list from the AD, or assign teams on Manage athletes.”

**Step 4: Browser check**

Hub → Rosters. Paste `Smith, Jane`. Prepare. Confirm create. Jane appears. Second confirm of same name + link existing does not duplicate membership.

---

### Task 6: Card editor — static preview

**Files:**

- Modify: `src/app/weight-room/cards/[id]/CardEditor.tsx`
- Modify: `src/app/weight-room/components/card-print.css` — add **screen-only** preview frame rules. Do not change `@media print` sheet geometry (`7.8in`, fiducials).

**Step 1: State**

```ts
const [previewDraft, setPreviewDraft] = useState<CardDraft | null>(null);
const [previewQr, setPreviewQr] = useState("");
const [previewUpdatedAt, setPreviewUpdatedAt] = useState<number | null>(null);
```

**Step 2: Stale detection**

```ts
function draftSignature(d: CardDraft): string {
  return JSON.stringify({
    sessionDate: d.sessionDate,
    focus: d.focus,
    title: d.title,
    movements: d.movements,
  });
}
const previewStale =
  previewDraft != null &&
  draft != null &&
  draftSignature(draft) !== draftSignature(previewDraft);
```

**Step 3: Update preview**

```ts
function onUpdatePreview() {
  if (!draft) return;
  setPreviewDraft(draft);
  setPreviewQr(qrUrl);
  setPreviewUpdatedAt(Date.now());
}
```

Do **not** bind the visible preview to live `draft`. Print stack can keep using live `draft` (existing behavior).

**Step 4: UI** (below Print stack, `print:hidden`)

- Heading **Preview**
- Button **Update preview**
- If no snapshot: “Click Update preview to render the signed-off sheet.”
- If snapshot: optional “Preview is stale — form changed since last update.”
- Visible frame (scaled ~0.55 on screen, overflow auto) containing:

```tsx
<div ref={previewRef} className="wr-preview-capture">
  <CardPrintView draft={previewDraft} templateQrUrl={previewQr || undefined} />
</div>
```

CSS: `.wr-preview-capture { width: 11in; }` so capture is letter landscape. Screen wrapper uses `transform: scale(...)` + height compensation. `@media print { .wr-preview-capture { display: none; } }` so Print stack is the only printed output.

**Step 5: Browser check**

Change title, preview unchanged. Click Update preview, title updates.

---

### Task 7: One-page card PDF from the preview

**Files:**

- Create: `src/lib/weight-room/card-pdf.ts` — `downloadPreviewPdf(node: HTMLElement, filename: string): Promise<void>`
- Modify: `src/app/weight-room/cards/[id]/CardEditor.tsx`
- Modify: `package.json` — `npm install html-to-image jspdf`

**Step 1: Install**

```bash
npm install html-to-image jspdf
```

**Step 2: Helper**

```ts
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

export async function downloadPreviewPdf(
  node: HTMLElement,
  filename: string
): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
  });
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: "letter",
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, 11, 8.5);
  pdf.save(filename);
}
```

Do not store the data URL in React state. Call, then discard.

**Step 3: Button**

**Download PDF** enabled only when `previewDraft` exists **and** `analyzeCardFit(previewDraft).scanSafe`. Filename: slug from title + date, e.g. `week-3-wednesday-lower-power.pdf`. Error in `text-danger` if rasterize throws.

Print copies stay independent (default 12).

**Step 4: Browser check**

Update preview → Download PDF → one landscape page. Open it: header, sticker pad, QR, movements match the preview. Print 2 copies still print 2 pages, not the PDF.

---

### Task 8: Overview aggregate (TDD)

**Files:**

- Create: `src/lib/weight-room/overview-aggregate.ts`
- Create: `src/lib/weight-room/overview-aggregate.test.ts`
- Modify: `src/lib/weight-room/report-aggregate.ts` only if you must export a helper (prefer not)

**Step 1: Failing tests**

```ts
import { describe, it, expect } from "vitest";
import { aggregateWeightRoomReport } from "./report-aggregate";
import { buildWeightRoomOverview } from "./overview-aggregate";

const baseReport = aggregateWeightRoomReport({
  hugo_group: "soccer",
  from: "2026-08-17",
  to: "2026-08-23",
  logs: [
    {
      id: "log-1",
      athlete_id: "a1",
      template_id: "t1",
      session_date: "2026-08-18",
      hugo_group: "soccer",
    },
  ],
  results: [
    {
      session_log_id: "log-1",
      movement_id: "m1",
      raw_text: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
      units: "lb",
    },
  ],
  movements: [{ id: "m1", name: "Trap-Bar Deadlift" }],
  athletes: [{ id: "a1", first_name: "Jane", last_name: "Smith" }],
});

describe("buildWeightRoomOverview", () => {
  it("lists rostered athletes with no confirmed log as no-shows", () => {
    const overview = buildWeightRoomOverview(baseReport, [
      { id: "a1", first_name: "Jane", last_name: "Smith" },
      { id: "a2", first_name: "Pat", last_name: "Lee" },
    ]);
    expect(overview.noShows.map((a) => a.id)).toEqual(["a2"]);
    expect(overview.attendanceCount).toBe(1);
    expect(overview.rosterCount).toBe(2);
  });

  it("exposes best load and outputs from the report", () => {
    const overview = buildWeightRoomOverview(baseReport, [
      { id: "a1", first_name: "Jane", last_name: "Smith" },
    ]);
    expect(overview.bestLoads[0]).toMatchObject({
      athlete_id: "a1",
      load: 185,
    });
    expect(overview.noShows).toEqual([]);
  });
});
```

**Step 2: Run (expect fail)**

```bash
npx vitest run src/lib/weight-room/overview-aggregate.test.ts
```

**Step 3: Implement**

```ts
export function buildWeightRoomOverview(
  report: WeightRoomReport,
  roster: ReportAthlete[]
): WeightRoomOverview {
  const present = new Set(report.athletes.map((a) => a.athlete_id));
  const noShows = roster
    .filter((a) => !present.has(a.id))
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const bestLoads = report.athletes
    .filter((a) => a.bestLoad != null)
    .map((a) => ({
      athlete_id: a.athlete_id,
      first_name: a.first_name,
      last_name: a.last_name,
      load: a.bestLoad as number,
    }))
    .sort((a, b) => b.load - a.load);
  const outputs = report.athletes.flatMap((a) =>
    a.outputs.map((o) => ({
      ...o,
      athlete_id: a.athlete_id,
      first_name: a.first_name,
      last_name: a.last_name,
    }))
  );
  return {
    hugo_group: report.hugo_group,
    from: report.from,
    to: report.to,
    rosterCount: roster.length,
    attendanceCount: report.athletes.length,
    attendanceByDate: report.attendanceByDate,
    bestLoads,
    outputs,
    noShows,
    athletes: report.athletes,
  };
}
```

No-show = on the **sport roster**, no confirmed `session_logs` for that `hugo_group` in range (already true if `report.athletes` only includes people with logs in that query).

**Step 4: Tests pass**

```bash
npx vitest run src/lib/weight-room/overview-aggregate.test.ts
```

---

### Task 9: Overview API + Team Overview UI

**Files:**

- Create: `src/app/api/weight-room/overview/route.ts`
- Modify: `src/lib/weight-room/report-load.ts` — export a `loadRoster(hugo_group)` helper or query memberships in the route
- Modify: `src/app/weight-room/reports/page.tsx` / `ReportsClient.tsx` — add overview tiles **above** PDF buttons (same pickers). Do **not** create a second date form.
- Modify: `src/app/weight-room/page.tsx` — hub **Reports** copy can say “Overview + PDF”

**Step 1: GET `/api/weight-room/overview`**

`requireCoachSession()`, `parseReportingDateRange`, `isHugoGroup`, 12-week cap (reuse `isWeightRoomReportRangeTooLong`). Load team report source (same query as `reports/team`) **plus** roster members for that group. `buildWeightRoomOverview`. `{ data }`. Empty roster + empty logs: 200 with zeros / empty arrays (not 500).

**Step 2: UI tiles** (match Athletes Team Overview: rounded-2xl border cards, accent bar, muted labels)

1. **Attendance** — `attendanceCount` / `rosterCount`, plus `attendanceByDate` as a short list
2. **Best loads** — name + load (— if none)
3. **Outputs** — name, movement, raw/parsed
4. **No-shows** — rostered, no confirmed lift in range

SWR key includes group/from/to. Loading and `text-danger` on error. PDF buttons stay; they must keep using blob download (no PDF in React state).

Individual athlete dropdown uses roster membership (`hugo_groups`), not the old scalar.

**Step 3: Browser check**

Soccer + last week, empty: tiles show 0 / empty no-shows if roster empty. After a confirm + roster membership, attendance 1 and the other kid (if rostered) is a no-show. Download team PDF still works.

---

### Task 10: Full weight-room test pass

**Step 1:**

```bash
npx vitest run src/lib/weight-room
```

Expected: all green (existing 75 plus new roster/overview tests).

**Step 2:**

```bash
npx tsc --noEmit
```

Expected: exit 0.

**Step 3: Hub smoke**

`/weight-room` lists Cards, Preview, Stickers, Scans, Rosters, Reports.

---

## Verification checklist

- [ ] Memberships applied; AD import cannot write until Confirm
- [ ] Athlete can have two sports; stickers issue if any membership exists
- [ ] Card preview does not live-update; Update preview refreshes
- [ ] Download PDF is one landscape page of the snapshot
- [ ] Print N copies unchanged
- [ ] Reports page shows attendance / best load / outputs / no-shows + existing PDFs
- [ ] Speed Journal leaderboard / `entries` unchanged

---

## Execution handoff

**Plan complete and saved to `docs/plans/2026-08-29-weight-room-preview-roster-overview-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** — Open a new session with **executing-plans**, batch execution with checkpoints. Stay on this dirty working tree (do not use a fresh worktree that would drop Checkpoint A + Tasks 1–12).

**Which approach?**
