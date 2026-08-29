# Hugo Workout-Card Intake Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a coach-PIN Weight-Room module: spreadsheet/JSON → letter-size cards, weekly scan upload with QR stickers and a review queue, then team/individual PDFs from reviewed lift logs—per [2026-08-24-hugo-workout-card-intake-design.md](./2026-08-24-hugo-workout-card-intake-design.md).

**Architecture:** New Postgres tables (`athlete_stickers`, `workout_templates`, `workout_movements`, `card_scans`, `session_logs`, `set_results`) plus `athletes.hugo_group`. Pure TypeScript modules own parsing, CSV import, QR payloads, extracurricular JSON mapping, and report aggregates. Route handlers stay thin (`sql` tagged templates, `{ data }` / `{ error }`, `getServerSession`). Vision is behind `extractCard()` so tests never call OpenAI. Cards print via HTML + landscape print CSS; report packets use `@react-pdf/renderer`. **Do not** write lifts into `entries` or public `/api/reporting/*`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, SWR, NextAuth credentials (coach PIN), Vercel Postgres, Vitest, `@vercel/blob`, `qrcode` + `jsqr`, OpenAI vision, `@react-pdf/renderer`.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`). Run `npm test` and `npm run dev` from the repo root.

**Prerequisite:** Isolated git worktree if the tree is dirty — @using-git-worktrees. Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

**Do not:** athlete phone logging, sport-coach login, OMR digit boxes, auto-save unreviewed OCR, mix lift data into Speed Journal `entries`.

---

## Reference: existing code to mirror

| Concern | File |
|--------|------|
| Coach PIN on writes | `src/app/api/athletes/route.ts` (lines 86–90) |
| Page redirect to login | `src/app/data-entry/page.tsx` (getServerSession + `redirect("/login?callbackUrl=/data-entry")`) |
| `{ data }` / `{ error }` | `src/app/api/cohort/signups/route.ts` |
| Date range validation | `src/lib/reporting-date-range.ts` (`parseReportingDateRange`) |
| Vitest style | `src/lib/csv-escape.test.ts`, `src/lib/reporting-date-range.test.ts` |
| Home Manage links | `src/app/page.tsx` (Athletes / Data entry / Cohort intake) |
| Extra session JSON source | copy from Obsidian `_export/hugo_athlete_log_sessions.json` → `src/lib/weight-room/extracurricular-sessions.json` |
| Visual card template | landscape log sheets from `build_hugo_athlete_log_sheets.py` (do not port the generator) |
| Schema style | `scripts/migrate-cohort-signups.sql` (`IF NOT EXISTS`, safe to re-run) |

**Routes:** `/weight-room` and `/api/weight-room/*` only. Do not add a public `/reporting` variant for lifts.

**Auth helper (DRY):** every Weight-Room API starts with `requireCoachSession()` from Task 1. Pages use the data-entry redirect pattern.

---

## Constants (single source)

Add in `src/lib/weight-room/constants.ts`:

```ts
export const HUGO_GROUPS = [
  "soccer",
  "volleyball",
  "xc",
  "extracurricular",
] as const;

export type HugoGroup = (typeof HUGO_GROUPS)[number];

export const QR_PREFIX = "lca-wr";
export const STICKER_QR_KIND = "sticker";
export const TEMPLATE_QR_KIND = "template";

export const SCAN_STATUSES = [
  "uploaded",
  "needs_review",
  "unmatched",
  "confirmed",
  "rejected",
] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];
```

---

### Task 1: `requireCoachSession` + Weight-Room types/constants (TDD)

**Files:**

- Create: `src/lib/require-coach.ts`
- Create: `src/lib/require-coach.test.ts`
- Create: `src/lib/weight-room/constants.ts`
- Create: `src/lib/weight-room/constants.test.ts`
- Create: `src/types/weight-room.ts`

**Step 1: Write failing tests**

`src/lib/weight-room/constants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HUGO_GROUPS, isHugoGroup } from "./constants";

describe("isHugoGroup", () => {
  it("accepts soccer volleyball xc extracurricular", () => {
    for (const g of HUGO_GROUPS) {
      expect(isHugoGroup(g)).toBe(true);
    }
  });

  it("rejects empty, soccer-like, and Speed Journal athlete_type values", () => {
    expect(isHugoGroup("")).toBe(false);
    expect(isHugoGroup("Soccer")).toBe(false);
    expect(isHugoGroup("athlete")).toBe(false);
    expect(isHugoGroup(null)).toBe(false);
  });
});
```

`src/lib/require-coach.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { requireCoachSession } from "./require-coach";

describe("requireCoachSession", () => {
  it("returns unauthorized when session is null", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const r = await requireCoachSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("returns ok when session exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Coach" } } as never);
    const r = await requireCoachSession();
    expect(r.ok).toBe(true);
  });
});
```

**Step 2: Run tests (expect failures)**

Run: `npm test -- src/lib/weight-room/constants.test.ts src/lib/require-coach.test.ts`  
Expected: FAIL (modules missing).

**Step 3: Implement**

`src/lib/weight-room/constants.ts` — `HUGO_GROUPS`, `isHugoGroup(value: unknown): value is HugoGroup`, QR/scan constants as in the Constants section above.

`src/lib/require-coach.ts`:

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type CoachSessionOk = { ok: true };
export type CoachSessionErr = { ok: false; status: 401; error: string };

export async function requireCoachSession(): Promise<CoachSessionOk | CoachSessionErr> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
```

`src/types/weight-room.ts` — export types matching the design (`WorkoutTemplate`, `WorkoutMovement`, `CardScan`, `SessionLog`, `SetResult`, `ParsedLoadReps`). Keep fields aligned with Task 6 SQL. No DB access here.

**Step 4: Run tests (expect pass)**

Run: `npm test -- src/lib/weight-room/constants.test.ts src/lib/require-coach.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/require-coach.ts src/lib/require-coach.test.ts src/lib/weight-room/constants.ts src/lib/weight-room/constants.test.ts src/types/weight-room.ts
git commit -m "feat(weight-room): add group constants and coach session guard"
```

---

### Task 2: `parseLoadReps` (TDD)

**Files:**

- Create: `src/lib/weight-room/parse-load-reps.ts`
- Create: `src/lib/weight-room/parse-load-reps.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseLoadReps } from "./parse-load-reps";

describe("parseLoadReps", () => {
  it("parses 185x5", () => {
    expect(parseLoadReps("185x5")).toEqual({
      raw: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
      units: "lb",
    });
  });

  it("parses 185 x 5 and 185lbs 5", () => {
    expect(parseLoadReps("185 x 5").kind).toBe("load_reps");
    expect(parseLoadReps("185 x 5").load).toBe(185);
    expect(parseLoadReps("185lbs 5").load).toBe(185);
    expect(parseLoadReps("185lbs 5").reps).toBe(5);
  });

  it("parses BW", () => {
    expect(parseLoadReps("BW").kind).toBe("bw");
    expect(parseLoadReps("body weight").kind).toBe("bw");
  });

  it("parses AMRAP 12", () => {
    const r = parseLoadReps("AMRAP 12");
    expect(r.kind).toBe("amrap");
    expect(r.reps).toBe(12);
    expect(r.load).toBeNull();
  });

  it("parses jump inches as output", () => {
    const r = parseLoadReps("22.5 in");
    expect(r.kind).toBe("output");
    expect(r.load).toBe(22.5);
    expect(r.units).toBe("in");
  });

  it("empty and garbage stay unknown with raw preserved", () => {
    expect(parseLoadReps("").kind).toBe("unknown");
    expect(parseLoadReps("  ").kind).toBe("unknown");
    const g = parseLoadReps("felt good");
    expect(g.kind).toBe("unknown");
    expect(g.raw).toBe("felt good");
    expect(g.load).toBeNull();
  });
});
```

**Step 2: Run tests (expect failures)**

Run: `npm test -- src/lib/weight-room/parse-load-reps.test.ts`  
Expected: FAIL.

**Step 3: Implement `parseLoadReps(raw: string)`**

Normalize with `.trim()`. Order: empty → BW → `AMRAP` + number → `\d+(\.\d+)?\s*in` → `load [lbs] x reps` (× or x) → `loadlbs reps` → unknown. Do not guess that a lone `12` is reps (too many false positives). Return `raw` as the trimmed input.

**Step 4: Run tests (expect pass)**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/weight-room/parse-load-reps.ts src/lib/weight-room/parse-load-reps.test.ts
git commit -m "feat(weight-room): parse freeform Load×Reps cell text"
```

---

### Task 3: QR payload encode/decode (TDD)

**Files:**

- Create: `src/lib/weight-room/qr-payload.ts`
- Create: `src/lib/weight-room/qr-payload.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  encodeStickerPayload,
  encodeTemplatePayload,
  decodeWeightRoomPayload,
} from "./qr-payload";

describe("qr-payload", () => {
  it("round-trips sticker and template UUIDs", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(decodeWeightRoomPayload(encodeStickerPayload(id))).toEqual({
      kind: "sticker",
      id,
    });
    expect(decodeWeightRoomPayload(encodeTemplatePayload(id))).toEqual({
      kind: "template",
      id,
    });
  });

  it("returns null for unrelated QR text", () => {
    expect(decodeWeightRoomPayload("https://example.com")).toBeNull();
    expect(decodeWeightRoomPayload("lca-wr:nope:abc")).toBeNull();
  });
});
```

**Step 2: Run tests (expect failures)**

Run: `npm test -- src/lib/weight-room/qr-payload.test.ts`  
Expected: FAIL.

**Step 3: Implement**

Format: `lca-wr:sticker:<uuid>` and `lca-wr:template:<uuid>` using `QR_PREFIX` from constants. Decode with a strict regex; UUID case-insensitive, return lowercase id.

**Step 4: Run tests (expect pass)**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/weight-room/qr-payload.ts src/lib/weight-room/qr-payload.test.ts
git commit -m "feat(weight-room): encode and decode sticker and template QR payloads"
```

---

### Task 4: CSV template import (TDD)

**Files:**

- Create: `src/lib/weight-room/csv-import.ts`
- Create: `src/lib/weight-room/csv-import.test.ts`

**Step 1: Write failing tests**

Cover: happy path two movements one template; unknown `hugo_group`; missing `session_date`; `set_count` not matching pipe-separated `targets` length; two dates → two templates.

```ts
import { describe, it, expect } from "vitest";
import { parseWorkoutCsv } from "./csv-import";

const HEADER =
  "week,day,session_date,focus,hugo_group,label,name,block,set_count,targets,notes";

describe("parseWorkoutCsv", () => {
  it("groups rows with the same group+date+focus into one template", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,extracurricular,1,DB Bench,Main,2,5 @ RPE 8|5 @ RPE 8,",
      "1,Monday,2026-09-08,Upper A,extracurricular,2,TRX Row,Main,2,12+|12+,BW",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates).toHaveLength(1);
    expect(r.templates[0].movements).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });

  it("keeps valid rows and records row errors", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,not-a-sport,1,DB Bench,Main,1,5,",
      "1,Monday,2026-09-08,Upper A,soccer,1,Goblet,Main,1,8,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.some((e) => e.row === 2)).toBe(true);
    expect(r.templates[0].hugo_group).toBe("soccer");
  });
});
```

**Step 2: Run tests (expect failures)**

Run: `npm test -- src/lib/weight-room/csv-import.test.ts`  
Expected: FAIL.

**Step 3: Implement `parseWorkoutCsv(text: string)`**

- Split lines; skip blank; require header exact (trim, case-sensitive as above).
- Parse CSV cells with a small splitter that honors quotes (reuse logic similar to RFC; YAGNI: if no quotes in v1 template, split on comma is OK **only if** you reject rows containing extra commas in `notes` — better: quote-aware split).
- `set_count` integer; `targets.split("|")`; if lengths differ, row error.
- Return `{ ok: true, templates, errors }` even when some rows fail. `{ ok: false }` only if header missing.

Template shape in memory (not DB):

```ts
{
  week_number: number | null;
  day_name: string;
  session_date: string;
  focus: string;
  hugo_group: HugoGroup;
  title: string; // `${day_name} — ${focus}`
  movements: Array<{
    sort_index: number;
    label: string;
    name: string;
    block: string;
    set_count: number;
    targets: string[];
    notes: string;
  }>;
}
```

**Step 4: Run tests (expect pass)**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/weight-room/csv-import.ts src/lib/weight-room/csv-import.test.ts
git commit -m "feat(weight-room): parse spreadsheet CSV into workout templates"
```

---

### Task 5: Extracurricular JSON mapper + copy fixture (TDD)

**Files:**

- Create: `src/lib/weight-room/extracurricular-sessions.json` (copy from `C:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Sales & Entrepreneurship\Coaching Business\_export\hugo_athlete_log_sessions.json`)
- Create: `src/lib/weight-room/from-extra-json.ts`
- Create: `src/lib/weight-room/from-extra-json.test.ts`

**Step 1: Write failing tests**

Use a **tiny inline fixture** in the test file (do not import the full 50-session JSON in the unit test). Map one Monday-shaped object:

```ts
import { describe, it, expect } from "vitest";
import { extraSessionToDraft, assignTermDates } from "./from-extra-json";

const monday = {
  week: 1,
  week_title: "Intro",
  day: "Monday",
  day_title: "Upper A",
  day_type: "upper",
  warmup_notes: "",
  max_sets: 2,
  movements: [
    {
      label: "1",
      name: "DB Bench",
      block: "Main",
      set_count: 2,
      targets: ["5 @ RPE 8", "5 @ RPE 8"],
      notes: "",
      from_pair: false,
      exercise_html: null,
      cluster_pct_targets: false,
    },
  ],
};

describe("extraSessionToDraft", () => {
  it("maps extra JSON session to a draft template", () => {
    const d = extraSessionToDraft(monday);
    expect(d.hugo_group).toBe("extracurricular");
    expect(d.week_number).toBe(1);
    expect(d.day_name).toBe("Monday");
    expect(d.focus).toBe("Upper A");
    expect(d.movements[0].name).toBe("DB Bench");
    expect(d.movements[0].targets).toEqual(["5 @ RPE 8", "5 @ RPE 8"]);
  });
});

describe("assignTermDates", () => {
  it("sets week 1 Monday to term start and Friday +4 days", () => {
    const drafts = [
      extraSessionToDraft(monday),
      extraSessionToDraft({ ...monday, day: "Friday", day_title: "Total" }),
    ];
    const dated = assignTermDates(drafts, "2026-09-08");
    expect(dated[0].session_date).toBe("2026-09-08");
    expect(dated[1].session_date).toBe("2026-09-12");
  });
});
```

**Step 2: Run tests (expect failures)**

Run: `npm test -- src/lib/weight-room/from-extra-json.test.ts`  
Expected: FAIL.

**Step 3: Implement**

Weekday offset: Monday=0 … Friday=4. `session_date = termStart + (week-1)*7 + offset` using UTC date-only math (same midday-UTC trick as `reporting-date-range.ts`). `title` = `Week ${week} (${week_title}) — ${day} — ${session-style focus}`.

Copy the real JSON file in this task (binary/text copy; do not hand-edit). Confirm `JSON.parse` works: `node -e "JSON.parse(require('fs').readFileSync('src/lib/weight-room/extracurricular-sessions.json','utf8')); console.log('ok')"`.

**Step 4: Run tests (expect pass)**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/weight-room/extracurricular-sessions.json src/lib/weight-room/from-extra-json.ts src/lib/weight-room/from-extra-json.test.ts
git commit -m "feat(weight-room): map extracurricular JSON sessions onto dated templates"
```

---

### Task 6: Database migration

**Files:**

- Create: `scripts/migrate-weight-room.sql`

**Step 1: Write SQL (safe to re-run)**

```sql
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hugo_group TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athletes_hugo_group_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_hugo_group_check
      CHECK (
        hugo_group IS NULL
        OR hugo_group IN ('soccer', 'volleyball', 'xc', 'extracurricular')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS athlete_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  payload TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_athlete_stickers_athlete_id ON athlete_stickers(athlete_id);

CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hugo_group TEXT NOT NULL,
  week_number INTEGER,
  day_name TEXT,
  session_date DATE NOT NULL,
  focus TEXT NOT NULL,
  title TEXT NOT NULL,
  layout TEXT NOT NULL DEFAULT 'landscape-letter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_templates_group_date
  ON workout_templates(hugo_group, session_date);

CREATE TABLE IF NOT EXISTS workout_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  sort_index INTEGER NOT NULL,
  label TEXT,
  name TEXT NOT NULL,
  block TEXT NOT NULL,
  set_count INTEGER NOT NULL,
  targets JSONB NOT NULL,
  notes TEXT,
  from_pair BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_workout_movements_template_id ON workout_movements(template_id);

CREATE TABLE IF NOT EXISTS card_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blob_url TEXT NOT NULL,
  template_id UUID REFERENCES workout_templates(id),
  athlete_id UUID REFERENCES athletes(id),
  sticker_payload TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  extraction JSONB,
  error TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_card_scans_status ON card_scans(status);

CREATE TABLE IF NOT EXISTS session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES workout_templates(id),
  scan_id UUID REFERENCES card_scans(id),
  session_date DATE NOT NULL,
  hugo_group TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_session_logs_group_date ON session_logs(hugo_group, session_date);

CREATE TABLE IF NOT EXISTS set_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_log_id UUID NOT NULL REFERENCES session_logs(id) ON DELETE CASCADE,
  movement_id UUID NOT NULL REFERENCES workout_movements(id),
  set_index INTEGER NOT NULL,
  raw_text TEXT,
  kind TEXT,
  load NUMERIC,
  reps NUMERIC,
  units TEXT,
  corrected BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (session_log_id, movement_id, set_index)
);
```

**Step 2: Run against the same Postgres as the app** (`POSTGRES_URL`). Do not invent a second database. If you cannot reach prod/staging, leave a note in the commit message that local run is still required.

**Step 3: Commit**

```bash
git add scripts/migrate-weight-room.sql
git commit -m "feat(weight-room): add lift-log tables and athletes.hugo_group"
```

---

### Task 7: Stickers API + print sheet

**Files:**

- Create: `src/app/api/weight-room/stickers/route.ts` — GET list, POST issue sticker for `athlete_id`
- Create: `src/app/weight-room/page.tsx` — hub with links (PIN redirect `callbackUrl=/weight-room`)
- Create: `src/app/weight-room/stickers/page.tsx`
- Create: `src/app/weight-room/stickers/StickerSheet.tsx` (`"use client"`)

**Step 1: API behavior**

- `requireCoachSession()`; 401 JSON `{ error }`.
- GET: join `athlete_stickers` ⨝ `athletes` where `active = true`, order last_name.
- POST body `{ athlete_id }`. If athlete already has active sticker, return it (201/200) — do not mint a second payload. Else insert `payload = encodeStickerPayload(crypto.randomUUID())` (the UUID in the payload is the sticker id, not necessarily the row UUID — **use the row `id`**: insert returning id, then if payload was placeholder, update **or** generate payload from the new row id: `encodeStickerPayload(rows[0].id)` in a second statement). Simplest: generate `id` in JS with `crypto.randomUUID()`, insert both `id` and `payload = encodeStickerPayload(id)`.
- PATCH deactivate is YAGNI for v1.

**Step 2: UI**

- Page: `getServerSession`; redirect to login like `src/app/cohort/intake/page.tsx`.
- Client: SWR `GET /api/weight-room/stickers` and `GET /api/athletes?active=true`. Button “Issue sticker” for athletes in a Hugo group without a sticker. Print CSS: grid of QR canvases (`qrcode` to data URL) + `last_name, first_name`. `@media print` hide chrome.

Install: `npm install qrcode` and `npm install -D @types/qrcode`.

**Step 3: Manual verify**

Run: `npm run dev`  
Open `/weight-room/stickers` logged in; 401/redirect when logged out. Issue one sticker; print preview shows QR.

**Step 4: Commit**

```bash
git add src/app/api/weight-room/stickers/route.ts src/app/weight-room/page.tsx src/app/weight-room/stickers package.json package-lock.json
git commit -m "feat(weight-room): issue and print reusable athlete QR stickers"
```

---

### Task 8: Template APIs (CRUD, CSV import, extra seed)

**Files:**

- Create: `src/app/api/weight-room/templates/route.ts` — GET list (`?hugo_group=&from=&to=`), POST from JSON body `{ template }` or `{ csv: string }`
- Create: `src/app/api/weight-room/templates/seed-extra/route.ts` — POST `{ term_start: "YYYY-MM-DD" }`
- Create: `src/app/api/weight-room/templates/[id]/route.ts` — GET one + movements, PATCH title/focus/date/movements, DELETE

**Step 1: Insert helper**

Parameterized inserts only. After `parseWorkoutCsv`, loop templates: INSERT template, then movements with `sort_index`. Use a transaction if `@vercel/postgres` in this repo supports it; if not, insert template first and movements second, delete template on movement failure.

Seed-extra: import JSON, `extraSessionToDraft` each, `assignTermDates`, skip if extracurricular templates already exist for that `session_date` (idempotent).

GET `[id]`: template + movements ordered by `sort_index`.

PATCH: replace movements (DELETE FROM workout_movements WHERE template_id = $id, then re-insert) inside the same request after auth. Reject if any `session_logs` reference this template (409) so reviewed history cannot be silently rewritten.

**Step 2: Manual verify**

```bash
# after login cookie; or use the UI from Task 9
curl -s -o NUL -w "%{http_code}" http://localhost:3000/api/weight-room/templates
```

Expected logged-out: `401`.

**Step 3: Commit**

```bash
git add src/app/api/weight-room/templates
git commit -m "feat(weight-room): template CRUD, CSV import, and extra JSON seed"
```

---

### Task 9: Card editor + landscape print

**Files:**

- Create: `src/app/weight-room/cards/page.tsx` — list templates, CSV file input, seed-extra form (term start date), links to `[id]`
- Create: `src/app/weight-room/cards/[id]/page.tsx`
- Create: `src/app/weight-room/cards/[id]/CardEditor.tsx`
- Create: `src/app/weight-room/cards/[id]/CardPrintView.tsx`
- Create: `src/app/weight-room/cards/card-print.css`

**Step 1: Editor**

PIN redirect `callbackUrl=/weight-room/cards`. SWR load template. Fields: date, focus, title, movement table (label, name, block, set_count, targets joined by `|`, notes). Save PATCH. “Print stack” asks for copy count N (default 12), then `window.print()` on a hidden/print-only subtree that repeats `CardPrintView` N times with `page-break-after: always`.

**Step 2: Print layout (must include scan aids)**

Landscape `@page { size: landscape; margin: 0.4in; }`. Header: `title`, date `MM-DD-YY`, focus. Meta row: `Athlete: ____` and sport checkboxes Soccer / Volleyball / XC / Extra. Template QR (from `encodeTemplatePayload(template.id)`). Top-right sticker pad. Three fiducial squares. Table: Exercise | Set 1..n each with Reps (target) + Load×Reps blank. Block overflow: if `max_sets > 8` or movement count > 18, show editor error and **do not** offer print (tune numbers if a real extra Monday still fits — extra sheets already print on one landscape page; match that density).

Reuse day header colors from the Python CSS conceptually (upper/lower/total/conditioning) via a small map on `focus`/`day_name` — YAGNI to copy every tint; one accent bar is enough if timeboxed.

**Step 3: Manual verify**

Seed extra with term start; open Week 1 Monday; print preview is one landscape page with QR + sticker pad. Print 2 copies → 2 pages.

**Step 4: Commit**

```bash
git add src/app/weight-room/cards
git commit -m "feat(weight-room): card editor and landscape batch print"
```

---

### Task 10: Scan upload + extraction pipeline

**Files:**

- Create: `src/lib/weight-room/extract-card.ts` — `extractCard(input, deps)` 
- Create: `src/lib/weight-room/extract-card.test.ts` — mock `deps.vision` and `deps.decodeQr`
- Create: `src/app/api/weight-room/scans/route.ts` — GET inbox, POST multipart upload
- Create: `src/lib/weight-room/decode-qr-image.ts` — wrap `jsqr` (implementation; vision client in `src/lib/weight-room/openai-vision.ts`)

Install: `npm install @vercel/blob jsqr openai pdf-lib` (pdf-lib: rasterize/split pages — if pdf-to-image is too heavy for Vercel, v1 accept **images only** and document “export PDF pages to JPG in the scanner driver”; **prefer images-only in v1** if `pdf-lib` cannot rasterize without extra binaries). **YAGNI decision:** POST accepts `image/jpeg`, `image/png`, `image/webp` only. Multi-page PDF = coach exports pages. Mention this on the upload UI.

**Step 1: Tests for `extractCard`**

Given decodeQr returns template + sticker payloads, and vision returns `{ "mov-1:0": "185x5" }`, output uses `parseLoadReps` and status `needs_review`. If sticker missing → `unmatched`. If template missing → status `uploaded` with error `unknown_template`.

**Step 2: Implement extract + POST**

- Auth. Cap file size 12 MB; 400 otherwise.
- `put()` to Vercel Blob; store `blob_url`.
- Run extract; INSERT `card_scans`.
- OpenAI: structured JSON map of cell keys `movementId:setIndex` → string. Prompt includes the template movement list so the model fills known boxes only. Timeout → `error` column, status `uploaded`.
- Env: `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`. Never log image bytes.

**Step 3: Commit**

```bash
git add src/lib/weight-room/extract-card.ts src/lib/weight-room/extract-card.test.ts src/lib/weight-room/decode-qr-image.ts src/lib/weight-room/openai-vision.ts src/app/api/weight-room/scans/route.ts package.json package-lock.json
git commit -m "feat(weight-room): upload scans and extract known cells for review"
```

---

### Task 11: Review queue + confirm

**Files:**

- Create: `src/app/api/weight-room/scans/[id]/route.ts` — GET detail, PATCH assign athlete / edit cells
- Create: `src/app/api/weight-room/scans/[id]/confirm/route.ts` — POST persist log
- Create: `src/lib/weight-room/confirm-scan.ts` — pure function: scan + template + edited cells → session_log + set_results rows (no SQL)
- Create: `src/lib/weight-room/confirm-scan.test.ts`
- Create: `src/app/weight-room/scans/page.tsx`
- Create: `src/app/weight-room/scans/[id]/ReviewClient.tsx`

**Step 1: `buildConfirmPayload` tests**

- One movement two sets → two `set_results`
- Edited cell sets `corrected: true` when raw differs from extraction
- Missing athlete throws / returns `{ ok: false }`

**Step 2: Confirm route**

- Auth. Load scan + template movements. Require `athlete_id`. UPSERT `session_logs` on `(athlete_id, template_id)`. Replace `set_results` for that log. Set scan `status = confirmed`. If duplicate warn already shown in UI, still overwrite (design: unique constraint).
- Warn payload on GET: query existing session_log for sticker athlete + template.

**Step 3: UI**

Inbox: filter by status (SWR). Review: image (`blob_url`), athlete picker (Hugo roster), table of sets (raw editable), Confirm / Reject (`status = rejected`). Unmatched: athlete picker required.

**Step 4: Manual verify**

Upload a photo of a printed extra Monday (sticker on pad). Confirm. Check `session_logs` / `set_results` in Postgres.

**Step 5: Commit**

```bash
git add src/app/api/weight-room/scans src/lib/weight-room/confirm-scan.ts src/lib/weight-room/confirm-scan.test.ts src/app/weight-room/scans
git commit -m "feat(weight-room): review queue confirms scans into session logs"
```

---

### Task 12: Report aggregations + PDF + nav

**Files:**

- Create: `src/lib/weight-room/report-aggregate.ts`
- Create: `src/lib/weight-room/report-aggregate.test.ts`
- Create: `src/app/api/weight-room/reports/team/route.ts` — GET `hugo_group`, `from`, `to`; `Content-Type: application/pdf`
- Create: `src/app/api/weight-room/reports/athlete/route.ts` — GET `athlete_id`, `from`, `to`
- Create: `src/lib/weight-room/report-pdf.tsx` — `@react-pdf/renderer` document
- Create: `src/app/weight-room/reports/page.tsx`
- Modify: `src/app/page.tsx` — Manage link **Weight room** → `/weight-room`
- Modify: `src/app/weight-room/page.tsx` — link to reports if not already

Install: `npm install @react-pdf/renderer`

**Step 1: Aggregate tests (in-memory logs)**

```ts
it("counts attendance as distinct confirmed session dates per athlete", () => {});
it("sums parsed reps as volume and ignores unknown kinds", () => {});
it("returns empty athletes array when there are no logs", () => {});
```

Input: `{ logs, results, movements, athletes, from, to, hugo_group }`. Output matches design §7 (attendance, movements list, volume, best load in range, outputs).

**Step 2: Routes**

- `requireCoachSession()`. `parseReportingDateRange({ from, to })`. 400 on bad dates.
- `isHugoGroup` on team route. 400 otherwise.
- Query session_logs in range + join athletes where `hugo_group` matches (team) or `athlete_id` (individual).
- Render PDF; `Content-Disposition: attachment; filename="hugo-<group>-<from>-<to>.pdf"`.
- Zero logs: still 200 PDF with an “No reviewed sessions in this range” first page (not a 500).

**Step 3: Reports UI**

Group select, from/to (default last Monday–Sunday in local TZ is OK; document it). Buttons: Download team PDF, select athlete → download individual. Fetch via `window.location` or blob download — **do not** hold PDF bytes in React state (same rule as reporting CSV).

**Step 4: Build**

Run: `npm test`  
Expected: all green.

Run: `npm run build`  
Expected: success, no TS errors.

**Step 5: Commit**

```bash
git add src/lib/weight-room/report-aggregate.ts src/lib/weight-room/report-aggregate.test.ts src/lib/weight-room/report-pdf.tsx src/app/api/weight-room/reports src/app/weight-room/reports src/app/page.tsx src/app/weight-room/page.tsx package.json package-lock.json
git commit -m "feat(weight-room): team and individual PDF reports from reviewed logs"
```

---

## Verification checklist (before merge)

- [ ] `npm test` — all green
- [ ] `npm run build` — passes
- [ ] `scripts/migrate-weight-room.sql` applied on the target DB
- [ ] Logged-out `/api/weight-room/*` → 401; pages redirect to login
- [ ] Extra Week 1 Monday prints on one landscape letter page with template QR + sticker pad
- [ ] Sticker + photo → review → `session_logs` row
- [ ] Team PDF for `soccer` last week; empty range still downloads a PDF
- [ ] Speed Journal leaderboard / `entries` / public `/reporting` unchanged

---

## Execution handoff

**Plan complete and saved to `docs/plans/2026-08-24-hugo-workout-card-intake-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** — Open a new session with **executing-plans**, batch execution with checkpoints. Use a git worktree (@using-git-worktrees) if this branch is dirty.

**Which approach?**

If **Subagent-Driven** is chosen: **REQUIRED SUB-SKILL:** @superpowers:subagent-driven-development — stay in-session, one subagent per task plus code review.

If **Parallel Session** is chosen: **REQUIRED SUB-SKILL:** @superpowers:executing-plans in the new session; use the worktree from @using-git-worktrees if applicable.
