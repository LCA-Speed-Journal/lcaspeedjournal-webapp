# Manual Weight-Room Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a coach log a small group (typically 4–6 athletes) in a spreadsheet grid — athletes as columns, exercises as rows — starting from that day’s workout card, with warmup lists expanded into drills and on-the-day row adds, writing the same `session_logs` / `set_results` as scan confirm.

**Architecture:** Bind the grid to an existing `workout_templates` card. Expand zero-set warmup notes into per-drill rows (defaults from the prescription). Persist athlete overrides via batch upsert with `scan_id = null`. Insert new on-the-day movements additively (never full movement replace after logs exist). Dual-write mapped Speed Journal tests only when that athlete has no entry for that date + metric.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, SWR, NextAuth coach session, Vercel Postgres (`sql` from `src/lib/db.ts`), Vitest.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`). Run `npm test` and `npm run dev` from the repo root. Paths are relative to that root.

**Do not:** change OCR / scan confirm UX; rewrite Team Progress ISO Rocks to read `set_results`; edit printed card layout from this page; auto-select the entire roster as columns; delete template movements that already have results; overwrite existing Speed Journal entries.

**Reference:** Design decisions validated in chat (hybrid card + on-the-day rows; warmup defaults with overrides; journal fill-if-missing). Patterns: [`src/lib/weight-room/confirm-scan.ts`](../../src/lib/weight-room/confirm-scan.ts), [`src/app/api/weight-room/scans/[id]/confirm/route.ts`](../../src/app/api/weight-room/scans/[id]/confirm/route.ts), [`src/lib/norms/weight-room-journal.ts`](../../src/lib/norms/weight-room-journal.ts), [`src/lib/weight-room/parse-load-reps.ts`](../../src/lib/weight-room/parse-load-reps.ts), [`src/app/weight-room/page.tsx`](../../src/app/weight-room/page.tsx). Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

---

## Domain notes (read before coding)

### Data truth
- Lift truth: `session_logs` + `set_results` (not Speed Journal `entries` unless dual-write).
- One log per `(athlete_id, template_id)`; re-save upserts and replaces that log’s `set_results`.
- Cell key: `` `${movement_id}:${set_index}` `` (0-based), same as scan confirm.
- Movements with `set_count = 0` produce no `set_results` today. Warmup drill expansion creates **new** movements with `set_count: 1`.

### Warmup split rules
- Delimiters: middle-dot `·`, semicolon `;`, newlines.
- Em-dash `—` is always a list delimiter (optional surrounding spaces).
- En-dash `–` and hyphen `-` are list delimiters **only when both sides are whitespace** (` – `, ` - `).
- Never split hyphenated words (`bent-knee`, `deep-tier`, `high-knee`) or dose ranges (`45–60s`, `45-60s`).

### Cell resolution
- Each grid row has a **Default** value (from `targets[setIndex]` or warmup dose).
- Athlete cell empty/cleared → skip that set (no / null `raw_text` in results).
- Athlete cell unset (inherit) → save the Default resolved text.
- Athlete cell typed → save that override.

### Journal fill-if-missing
- Only for movements with `speed_journal_metric_key` and parsed `kind === "output"`.
- Skip insert if **any** `entries` row already exists for that athlete + session date + metric (+ component), regardless of `source`.
- Do not overwrite.

### Additive template edits
- Card PATCH refuses movement replace when logs exist (`TEMPLATE_HAS_LOGS_ERROR`).
- Manual log **appends** new `workout_movements` rows only; keep original zero-set warmup blob for print.

---

### Task 1: Warmup drill splitter (TDD)

**Files:**
- Create: `src/lib/weight-room/split-warmup-drills.ts`
- Test: `src/lib/weight-room/split-warmup-drills.test.ts`

**Step 1: Write the failing test**

Create `src/lib/weight-room/split-warmup-drills.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitWarmupDrills } from "./split-warmup-drills";

describe("splitWarmupDrills", () => {
  it("splits extracurricular middle-dot lists and extracts trailing dose", () => {
    const notes =
      "Spring ankle (bent-knee) 45s/leg · hip hike 15/side · lunge ISO acc. 60s/leg";
    expect(splitWarmupDrills(notes)).toEqual([
      { name: "Spring ankle (bent-knee)", dose: "45s/leg" },
      { name: "hip hike", dose: "15/side" },
      { name: "lunge ISO acc.", dose: "60s/leg" },
    ]);
  });

  it("keeps hyphenated words and dose ranges intact", () => {
    expect(splitWarmupDrills("Spring ankle (bent-knee) 45s/leg")).toEqual([
      { name: "Spring ankle (bent-knee)", dose: "45s/leg" },
    ]);
    expect(splitWarmupDrills("deep push-up ISO 45–60s")).toEqual([
      { name: "deep push-up ISO", dose: "45–60s" },
    ]);
    expect(splitWarmupDrills("deep push-up ISO 45-60s")).toEqual([
      { name: "deep push-up ISO", dose: "45-60s" },
    ]);
  });

  it("splits on em-dash and spaced en/hyphen list separators", () => {
    expect(
      splitWarmupDrills("Spring ankle 45s/leg — hip hike 15/side")
    ).toEqual([
      { name: "Spring ankle", dose: "45s/leg" },
      { name: "hip hike", dose: "15/side" },
    ]);
    expect(
      splitWarmupDrills("Spring ankle 45s/leg – hip hike 15/side")
    ).toHaveLength(2);
    expect(
      splitWarmupDrills("Spring ankle 45s/leg - hip hike 15/side")
    ).toHaveLength(2);
  });

  it("splits on semicolon and newlines", () => {
    expect(splitWarmupDrills("A 10s; B 20s")).toEqual([
      { name: "A", dose: "10s" },
      { name: "B", dose: "20s" },
    ]);
    expect(splitWarmupDrills("A 10s\nB 20s")).toHaveLength(2);
  });

  it("returns empty for blank input", () => {
    expect(splitWarmupDrills("")).toEqual([]);
    expect(splitWarmupDrills("   ")).toEqual([]);
  });

  it("keeps drills without a trailing dose", () => {
    expect(splitWarmupDrills("Prime-times · A-switch")).toEqual([
      { name: "Prime-times", dose: "" },
      { name: "A-switch", dose: "" },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/weight-room/split-warmup-drills.test.ts`

Expected: FAIL (module / export not found).

**Step 3: Write minimal implementation**

Create `src/lib/weight-room/split-warmup-drills.ts`:

```ts
export type WarmupDrill = {
  name: string;
  dose: string;
};

/** Trailing dose: 45s/leg, 15/side, 1×10/leg, ×15, 45–60s, 2×6–8, etc. */
const DOSE_RE =
  /^(.*?)(?:\s+)((?:\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*s(?:\/\w+)?)|(?:\d+\/\w+)|(?:\d+\s*[x×]\s*\d+(?:\s*[–-]\s*\d+)?)(?:\/\w+)?|(?:[x×]\s*\d+))$/i;

/**
 * Split a warmup notes blob into named drills + trailing dose strings.
 * List delimiters: · ; newlines; em-dash; spaced en-dash/hyphen only.
 * Does not split hyphenated words or compact dose ranges (45-60s).
 */
export function splitWarmupDrills(notes: string): WarmupDrill[] {
  const trimmed = notes.trim();
  if (!trimmed) return [];

  // Tokenize: split on · ; newlines; em dash; whitespace-bounded - or –
  const parts = trimmed
    .split(/\s*[·;]\s*|\n+|\s*—\s*|(?<=\s)[–-](?=\s)/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const m = part.match(DOSE_RE);
    if (!m) return { name: part, dose: "" };
    return { name: m[1]!.trim(), dose: m[2]!.trim() };
  });
}
```

Adjust the regex if tests force edge cases; keep the delimiter rules above.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/weight-room/split-warmup-drills.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/weight-room/split-warmup-drills.ts src/lib/weight-room/split-warmup-drills.test.ts
git commit -m "$(cat <<'EOF'
feat(weight-room): split warmup notes into named drills

EOF
)"
```

---

### Task 2: Extend parseLoadReps for duration and side/reps doses (TDD)

**Files:**
- Modify: `src/types/weight-room.ts` (`ParsedLoadReps.kind`)
- Modify: `src/lib/weight-room/parse-load-reps.ts`
- Modify: `src/lib/weight-room/parse-load-reps.test.ts`

**Step 1: Write the failing tests**

Append to `src/lib/weight-room/parse-load-reps.test.ts`:

```ts
  it("parses duration seconds including /leg and ranges", () => {
    expect(parseLoadReps("45s")).toMatchObject({
      kind: "duration",
      load: 45,
      units: "s",
    });
    expect(parseLoadReps("45s/leg")).toMatchObject({
      kind: "duration",
      load: 45,
      units: "s",
    });
    // Ranges: use the upper bound so progression charts see the prescription ceiling
    expect(parseLoadReps("45–60s")).toMatchObject({
      kind: "duration",
      load: 60,
      units: "s",
    });
    expect(parseLoadReps("45-60s")).toMatchObject({
      kind: "duration",
      load: 60,
      units: "s",
    });
  });

  it("parses side/count doses as reps kind (not volume load_reps)", () => {
    expect(parseLoadReps("15/side")).toMatchObject({
      kind: "reps",
      reps: 15,
      load: null,
    });
    expect(parseLoadReps("×15")).toMatchObject({
      kind: "reps",
      reps: 15,
    });
    expect(parseLoadReps("x15")).toMatchObject({
      kind: "reps",
      reps: 15,
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/weight-room/parse-load-reps.test.ts`

Expected: FAIL on new cases (`kind` not `"duration"` / `"reps"`).

**Step 3: Minimal implementation**

In `src/types/weight-room.ts`, widen:

```ts
kind: "load_reps" | "bw" | "amrap" | "output" | "duration" | "reps" | "unknown";
```

In `src/lib/weight-room/parse-load-reps.ts`, after AMRAP and before inches, add:

```ts
  const duration = trimmed.match(
    /^(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*s(?:\/\w+)?$/i
  );
  if (duration) {
    const low = Number(duration[1]);
    const high = duration[2] != null ? Number(duration[2]) : low;
    return {
      raw: trimmed,
      kind: "duration",
      load: high,
      reps: null,
      units: "s",
    };
  }

  const sideReps = trimmed.match(/^(\d+)\s*\/\s*\w+$/i);
  if (sideReps) {
    return {
      raw: trimmed,
      kind: "reps",
      load: null,
      reps: Number(sideReps[1]),
      units: null,
    };
  }

  const timesReps = trimmed.match(/^[x×]\s*(\d+)$/i);
  if (timesReps) {
    return {
      raw: trimmed,
      kind: "reps",
      load: null,
      reps: Number(timesReps[1]),
      units: null,
    };
  }
```

Do **not** add `"duration"` or `"reps"` to `VOLUME_KINDS` in `report-aggregate.ts` (leave as `load_reps` + `amrap` only).

**Step 4: Run tests**

Run: `npm test -- src/lib/weight-room/parse-load-reps.test.ts`

Expected: all PASS (old + new).

**Step 5: Commit**

```bash
git add src/types/weight-room.ts src/lib/weight-room/parse-load-reps.ts src/lib/weight-room/parse-load-reps.test.ts
git commit -m "$(cat <<'EOF'
feat(weight-room): parse duration and reps warmup doses

EOF
)"
```

---

### Task 3: Manual-log cell resolution + batch payload (TDD)

**Files:**
- Create: `src/lib/weight-room/manual-log.ts`
- Test: `src/lib/weight-room/manual-log.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  resolveAthleteCell,
  buildManualLogAthletePayload,
  buildGridRowsFromTemplate,
} from "./manual-log";
import { splitWarmupDrills } from "./split-warmup-drills";

const MOVEMENT_ID = "11111111-1111-4111-8111-111111111111";
const WARMUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATHLETE_A = "22222222-2222-4222-8222-222222222222";
const ATHLETE_B = "33333333-3333-4333-8333-333333333333";
const TEMPLATE_ID = "44444444-4444-4444-8444-444444444444";

describe("resolveAthleteCell", () => {
  it("inherits default when override is undefined", () => {
    expect(resolveAthleteCell("45s/leg", undefined)).toBe("45s/leg");
  });

  it("uses override when typed", () => {
    expect(resolveAthleteCell("45s/leg", "60s/leg")).toBe("60s/leg");
  });

  it("cleared override means skip (null)", () => {
    expect(resolveAthleteCell("45s/leg", "")).toBeNull();
  });
});

describe("buildGridRowsFromTemplate", () => {
  it("expands zero-set warmup notes into drill rows and keeps set rows", () => {
    const rows = buildGridRowsFromTemplate([
      {
        id: WARMUP_ID,
        name: "Warmup Circuit",
        block: "Warmup",
        set_count: 0,
        targets: [],
        notes: "Spring ankle (bent-knee) 45s/leg · hip hike 15/side",
        label: "W",
      },
      {
        id: MOVEMENT_ID,
        name: "Goblet Squat",
        block: "Main",
        set_count: 2,
        targets: ["50x8", "55x8"],
        notes: "",
        label: "1",
      },
    ]);

    expect(rows.filter((r) => r.source === "warmup_expand")).toHaveLength(2);
    expect(rows.some((r) => r.movementId === MOVEMENT_ID && r.setIndex === 0)).toBe(
      true
    );
    expect(rows.find((r) => r.defaultText === "45s/leg")?.name).toContain(
      "Spring ankle"
    );
  });
});

describe("buildManualLogAthletePayload", () => {
  it("builds confirm-compatible results with scan_id null for two athletes", () => {
    const movements = [
      { id: MOVEMENT_ID, set_count: 1 },
    ];
    const defaults: Record<string, string> = {
      [`${MOVEMENT_ID}:0`]: "185x5",
    };
    const batch = buildManualLogAthletePayload({
      templateId: TEMPLATE_ID,
      sessionDate: "2026-09-17",
      hugoGroup: "extracurricular",
      movements,
      defaults,
      athletes: [
        {
          athleteId: ATHLETE_A,
          // inherit default
          cells: {},
        },
        {
          athleteId: ATHLETE_B,
          cells: { [`${MOVEMENT_ID}:0`]: "195x5" },
        },
      ],
    });

    expect(batch).toHaveLength(2);
    expect(batch[0]!.log.scan_id).toBeNull();
    expect(batch[0]!.results[0]).toMatchObject({
      raw_text: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
    });
    expect(batch[1]!.results[0]).toMatchObject({
      raw_text: "195x5",
      load: 195,
    });
  });

  it("omits cleared cells as null raw_text", () => {
    const batch = buildManualLogAthletePayload({
      templateId: TEMPLATE_ID,
      sessionDate: "2026-09-17",
      hugoGroup: "extracurricular",
      movements: [{ id: MOVEMENT_ID, set_count: 1 }],
      defaults: { [`${MOVEMENT_ID}:0`]: "185x5" },
      athletes: [{ athleteId: ATHLETE_A, cells: { [`${MOVEMENT_ID}:0`]: "" } }],
    });
    expect(batch[0]!.results[0]!.raw_text).toBeNull();
  });
});
```

**Step 2: Run — expect FAIL**

Run: `npm test -- src/lib/weight-room/manual-log.test.ts`

**Step 3: Implement `src/lib/weight-room/manual-log.ts`**

Reuse `cellKey`, `parseLoadReps`, and the same result shape as `buildConfirmPayload`. Prefer calling `buildConfirmPayload` per athlete with synthetic scan `{ id: null, athlete_id, template_id, extraction: { cells: {}, parsed: {}, warnings: [] } }` and `editedCells` filled with **resolved** texts (defaults applied). For cleared cells, pass `""` so confirm emits `raw_text: null`.

`buildGridRowsFromTemplate`:
- For each movement with `set_count > 0`, emit one row per set (`defaultText = targets[i] ?? ""`).
- For each movement with `set_count === 0` and non-empty notes, call `splitWarmupDrills(notes)` and emit provisional rows with `source: "warmup_expand"`, `movementId: null` (client assigns temp ids; server inserts real UUIDs on save), `setIndex: 0`, `defaultText: dose`.
- Do **not** emit a grid row for the zero-set blob itself (print-only).

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add src/lib/weight-room/manual-log.ts src/lib/weight-room/manual-log.test.ts
git commit -m "$(cat <<'EOF'
feat(weight-room): build manual log grid rows and batch payloads

EOF
)"
```

---

### Task 4: Journal fill-if-missing helper (TDD)

**Files:**
- Modify: `src/lib/norms/weight-room-journal.ts`
- Create or modify test: `src/lib/norms/weight-room-journal.test.ts` (create if missing)

**Step 1: Write pure helper tests first**

Export a pure function that decides which mapped posts to attempt:

```ts
export function journalPostsForFillIfMissing(input: {
  movements: { id: string; speed_journal_metric_key: string | null; speed_journal_component?: string | null }[];
  existingKeys: Set<string>; // `${metric_key}::${component ?? ""}`
}): JournalPostChoice[] {
  // For each mapped movement, post:true if key not in existingKeys
}
```

Key helper: `entryPresenceKey(metricKey, component) => \`${metricKey}::${component ?? ""}\``.

Also add:

```ts
export async function loadExistingEntryKeysForAthleteDate(
  athleteId: string,
  sessionDate: string
): Promise<Set<string>>
```

SQL sketch:

```sql
SELECT e.metric_key, e.component
FROM entries e
JOIN sessions s ON s.id = e.session_id
WHERE e.athlete_id = ${athleteId}
  AND s.session_date = ${sessionDate}
```

Build the Set from rows. **Ignore `source`** — any entry blocks fill.

Unit-test `journalPostsForFillIfMissing` without DB:
- mapped CMJ + empty existing → `{ post: true }`
- mapped CMJ + existing `Vertical Jump::` → `{ post: false }` or omit

**Step 2: Run FAIL then implement PASS**

**Step 3: Wire into a thin `dualWriteWeightRoomJournalFillIfMissing`** that:
1. loads existing keys
2. builds posts via `journalPostsForFillIfMissing`
3. calls existing `dualWriteWeightRoomJournal` only with `post: true` items

Do **not** change scan confirm’s checkbox behavior in this task (scan path stays opt-in). Manual-log route will call the fill-if-missing wrapper.

**Step 4: Commit**

```bash
git add src/lib/norms/weight-room-journal.ts src/lib/norms/weight-room-journal.test.ts
git commit -m "$(cat <<'EOF'
feat(norms): fill missing Speed Journal entries from weight-room outputs

EOF
)"
```

---

### Task 5: Additive movement insert helper

**Files:**
- Modify: `src/lib/weight-room/insert-template.ts`
- Test: `src/lib/weight-room/insert-template.test.ts` (extend or create focused unit tests for input shaping if DB-free; otherwise test payload builder in `manual-log.ts`)

**Step 1:** Export `appendTemplateMovements(templateId, movements: MovementInsertInput[]): Promise<WorkoutMovementRow[]>` that reuses the private `insertMovements` loop (or duplicate the INSERT — prefer exporting/refactoring `insertMovements` to shared).

**Step 2:** Add `buildWarmupExpandInserts(drills, sortIndexStart, block = "Warmup")` in `manual-log.ts`:

```ts
// each drill → { sort_index, label: "W", name, block: "Warmup", set_count: 1,
//   targets: [dose || ""], notes: "", from_pair: false,
//   speed_journal_metric_key: null, speed_journal_component: null }
```

**Step 3:** Unit-test `buildWarmupExpandInserts` only (no DB).

**Step 4: Commit**

```bash
git add src/lib/weight-room/insert-template.ts src/lib/weight-room/manual-log.ts src/lib/weight-room/manual-log.test.ts
git commit -m "$(cat <<'EOF'
feat(weight-room): append movements for manual-log warmup expands

EOF
)"
```

---

### Task 6: GET /api/weight-room/manual-log

**Files:**
- Create: `src/app/api/weight-room/manual-log/route.ts`

**Step 1: Implement GET**

Coach auth via `requireCoachSession`. Query params: `template_id` (required UUID).

Response `{ data: { template, roster, logs } }` where:
- `template` = `getTemplateWithMovements(template_id)`
- `roster` = athletes from `loadRoster(template.hugo_group)` (or equivalent membership query with first/last names)
- `logs` = existing `session_logs` + `set_results` for that `template_id` (so UI can prefill athlete columns on revisit)

Error cases: 401, 400 invalid id, 404 missing template.

**Step 2: Smoke via typecheck / lint** (no route integration test required unless pattern exists).

**Step 3: Commit**

```bash
git add src/app/api/weight-room/manual-log/route.ts
git commit -m "$(cat <<'EOF'
feat(weight-room): GET manual-log session bootstrap

EOF
)"
```

---

### Task 7: POST /api/weight-room/manual-log

**Files:**
- Modify: `src/app/api/weight-room/manual-log/route.ts`

**Step 1: Body shape**

```ts
{
  template_id: string;
  new_movements?: MovementInsertInput[]; // warmup expands + on-the-day adds
  /** Map client temp row ids → cells still use real movement ids after remap */
  athletes: Array<{
    athlete_id: string;
    cells: Record<string, string>; // resolved or raw overrides; server re-resolves with defaults
  }>;
  defaults: Record<string, string>; // cellKey → default text for inherit
}
```

**Step 2: Save path**

1. Auth + validate `template_id`.
2. Load template; if `new_movements?.length`, `appendTemplateMovements` then reload template (or merge returned rows).
3. For each athlete:
   - Resolve cells with `resolveAthleteCell(defaults[key], cells[key])`.
   - `buildConfirmPayload` / `buildManualLogAthletePayload` with `scan_id: null`.
   - Upsert `session_logs` (same SQL as confirm, but `scan_id` = `null`; on conflict do **not** clobber an existing non-null `scan_id` unless you intentionally allow — prefer: `scan_id = COALESCE(session_logs.scan_id, EXCLUDED.scan_id)` so manual save does not erase a prior scan link).
   - Delete + insert `set_results` for that log (same restore-on-failure pattern as confirm is nice-to-have; at least delete+insert in try/catch).
4. For each athlete, call `dualWriteWeightRoomJournalFillIfMissing` with mapped movements + output cells.
5. Return `{ data: { logs, results_by_athlete, journal_warnings, inserted_movements } }`.

**Step 3: Commit**

```bash
git add src/app/api/weight-room/manual-log/route.ts
git commit -m "$(cat <<'EOF'
feat(weight-room): POST manual-log batch upsert

EOF
)"
```

---

### Task 8: Manual log UI page

**Files:**
- Create: `src/app/weight-room/log/page.tsx`
- Create: `src/app/weight-room/log/ManualLogClient.tsx`
- Modify: `src/app/weight-room/page.tsx` (hub link)

**Step 1: Server page**

Mirror scans page auth:

```tsx
// page.tsx — getServerSession, redirect to /login?callbackUrl=/weight-room/log, render <ManualLogClient />
```

**Step 2: Client UI**

`ManualLogClient.tsx` responsibilities:
1. Hugo group select + template select (reuse `GET /api/weight-room/templates?hugo_group=` then load `GET /api/weight-room/manual-log?template_id=`).
2. Athlete multi-select from roster (checkboxes or multi-select; default none).
3. Build rows via `buildGridRowsFromTemplate`.
4. Table: sticky exercise name | Default | one column per selected athlete.
5. Athlete cells: empty string means inherit (show muted default placeholder); user can clear to skip; typing overrides.
6. “Add row” inserts a local new movement (`set_count: 1`) into `new_movements` payload.
7. Pasting a delimiter list into an exercise name cell runs `splitWarmupDrills` and explodes into multiple rows.
8. Active-cell parse preview using `parseLoadReps`.
9. Save → POST; show journal warnings; refetch GET to confirm.

Keep visual language consistent with weight-room hub (border, surface-elevated, accent) — no new design system.

**Step 3: Hub link**

In `src/app/weight-room/page.tsx`, add a Link above or below Scans:

```tsx
<Link href="/weight-room/log" className="...">
  Manual log
</Link>
```

Update hub blurb one line: mention manual log for small groups.

**Step 4: Commit**

```bash
git add src/app/weight-room/log/page.tsx src/app/weight-room/log/ManualLogClient.tsx src/app/weight-room/page.tsx
git commit -m "$(cat <<'EOF'
feat(weight-room): spreadsheet UI for manual session log

EOF
)"
```

---

### Task 9: Verification

**Step 1: Unit suite**

Run: `npm test -- src/lib/weight-room/split-warmup-drills.test.ts src/lib/weight-room/parse-load-reps.test.ts src/lib/weight-room/manual-log.test.ts src/lib/norms/weight-room-journal.test.ts`

Expected: all PASS.

**Step 2: Lint / typecheck if usually run**

Run: `npm run lint` (fix only issues introduced by these files).

**Step 3: Manual browser checklist**

1. `npm run dev` → `/weight-room/log`.
2. Pick a template with a Warmup Circuit notes blob + a multi-set lift.
3. Select 2 athletes.
4. Confirm warmup expanded into drill rows with default doses; hyphenated `(bent-knee)` not split.
5. Leave athlete A inheriting ISO default; override athlete B Goblet set.
6. Save → reopen → cells restored.
7. `/weight-room/reports` for that group/date → attendance + best load includes the override.
8. If template has a mapped CMJ: enter inches for an athlete with no journal entry → leaderboard gains a mark; repeat save → no duplicate; athlete who already has a live-entry CMJ that day → no overwrite.

**Step 4: Final commit only if verification fixed bugs** (otherwise stop).

---

## Out of scope (v1)

- OCR / scan pipeline changes
- Team Progress reading athlete ISO `set_results`
- Editing printed card layout from manual log
- Defaulting all roster athletes as columns
- Deleting movements from a logged template

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-09-17-manual-weight-room-log-implementation.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — dispatch a fresh subagent per task, review between tasks (@superpowers:subagent-driven-development)
2. **Parallel Session (separate)** — open a new session on this branch/worktree with @superpowers:executing-plans and run task batches with checkpoints

Which approach?
