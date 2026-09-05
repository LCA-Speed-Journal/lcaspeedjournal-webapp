# Testing-day PDF Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild coach and athlete testing-day PDFs as portrait, sport · gender sections with a one-page table, zone badges, coach strength/deficiency coloring, a coach F2F pie + top-6 cards, an athlete focus badge, and fillable notes.

**Architecture:** Keep predicted 40s in the F2F engine. Put sectioning, ranks, badges, pie percents, and strength/deficiency in pure helpers under `src/lib/norms/` so Vitest can lock them without rendering PDFs. `testing-day-pdf.tsx` only lays out those helpers. Plumb `graduating_class` onto matrix athletes after the matrix is built (do not thread it through every hit). `boardForAudience("athlete")` keeps `f2f` for the focus badge.

**Tech Stack:** TypeScript, Vitest, `@react-pdf/renderer` v4 (`Page`, `Svg`, `Path`, `TextInput`).

**Worktree:** `feature/force-to-form` at `.worktrees/force-to-form` (already isolated). Do not create a second worktree. Do not commit `next.config.ts` or `.env.local`.

**Design:** [2026-09-04-testing-day-pdf-redesign-design.md](./2026-09-04-testing-day-pdf-redesign-design.md)

**PowerShell:** do not use `&&`. Separate commands with `;`.

**Skills:** @test-driven-development — failing test first, then minimal code. @verification-before-completion before claiming done.

---

### Task 1: Section chrome helpers

**Files:**
- Create: `src/lib/norms/testing-day-pdf-layout.ts`
- Create: `src/lib/norms/testing-day-pdf-layout.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { TestingDayMatrixAthlete } from "./testing-day";
import {
  formatPdfDate,
  formatPdfGrade,
  groupAthletesBySection,
  sectionHeading,
  sectionSubhead,
} from "./testing-day-pdf-layout";

function athlete(
  partial: Partial<TestingDayMatrixAthlete> & Pick<TestingDayMatrixAthlete, "athlete_id">
): TestingDayMatrixAthlete {
  return {
    first_name: "A",
    last_name: "B",
    gender: "M",
    sport: "soccer",
    cells: {},
    ...partial,
  };
}

describe("sectionHeading", () => {
  it("prefixes Boys or Girls unless the sport label already has gender", () => {
    expect(sectionHeading("soccer", "M")).toBe("Testing Day: Boys Soccer");
    expect(sectionHeading("volleyball", "F")).toBe("Testing Day: Girls Volleyball");
    expect(sectionHeading("mens_basketball", "M")).toBe(
      "Testing Day: Men's Basketball"
    );
    expect(sectionHeading(null, null)).toBe("Testing Day: No primary sport");
  });
});

describe("formatPdfDate", () => {
  it("uses an ordinal local date", () => {
    expect(formatPdfDate("2026-09-02")).toBe("September 2nd, 2026");
    expect(formatPdfDate("2026-09-01")).toBe("September 1st, 2026");
    expect(formatPdfDate("2026-09-03")).toBe("September 3rd, 2026");
    expect(formatPdfDate("2026-09-11")).toBe("September 11th, 2026");
  });
});

describe("formatPdfGrade", () => {
  it("maps graduating class to 9th-12th and omits others", () => {
    expect(formatPdfGrade(2027, new Date("2026-09-04T12:00:00"))).toBe("12th");
    expect(formatPdfGrade(null, new Date("2026-09-04T12:00:00"))).toBeNull();
  });
});

describe("sectionSubhead", () => {
  it("joins date and athlete count", () => {
    expect(sectionSubhead("2026-09-02", 25)).toBe(
      "September 2nd, 2026 — 25 Athletes"
    );
    expect(sectionSubhead("2026-09-02", 1)).toBe(
      "September 2nd, 2026 — 1 Athlete"
    );
  });
});

describe("groupAthletesBySection", () => {
  it("sorts sport then boys before girls", () => {
    const sections = groupAthletesBySection([
      athlete({ athlete_id: "g", gender: "F", sport: "soccer" }),
      athlete({ athlete_id: "b", gender: "M", sport: "soccer" }),
      athlete({ athlete_id: "v", gender: "F", sport: "volleyball" }),
    ]);
    expect(sections.map((s) => `${s.sport}|${s.gender}`)).toEqual([
      "soccer|M",
      "soccer|F",
      "volleyball|F",
    ]);
    expect(sections[0].athletes.map((a) => a.athlete_id)).toEqual(["b"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/norms/testing-day-pdf-layout.test.ts`

Expected: FAIL (module not found).

**Step 3: Write minimal implementation**

Reuse `sportLabel` logic from `testing-day-pdf.tsx` (Hugo `HUGO_GROUP_META` / `"No primary sport"`). Parse `YYYY-MM-DD` as `new Date(y, m - 1, d)` — not `new Date("2026-09-02")` (UTC off-by-one). Ordinals: reuse `formatPlace(day, false)` from `testing-day-rank.ts`. Grade: `graduatingClassToGrade` then `formatPlace(grade, false)`.

Heading: `Testing Day: {Boys|Girls} {sportLabel}` unless the label already matches `/^(men'?s|women'?s)\b/i`.

`groupAthletesBySection`: Map by `themeGroupKey(sport, gender)`; sort sport label A–Z, then `M`, `F`, unknown.

**Step 4: Run tests**

Run: `npx vitest run src/lib/norms/testing-day-pdf-layout.test.ts`

Expected: PASS.

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf-layout.ts src/lib/norms/testing-day-pdf-layout.test.ts
git commit -m "feat: group testing-day PDF sections by sport and gender"
```

---

### Task 2: Section ranks

**Files:**
- Modify: `src/lib/norms/testing-day-pdf-layout.ts`
- Modify: `src/lib/norms/testing-day-pdf-layout.test.ts`

**Step 1: Write the failing test**

```ts
import { compareScoredAthletes } from "./testing-day-rank";
import { sectionRanks, athleteSubline } from "./testing-day-pdf-layout";

describe("sectionRanks", () => {
  it("re-ranks inside the section and marks sort ties", () => {
    const athletes = [
      athlete({
        athlete_id: "a",
        first_name: "Ann",
        last_name: "Aye",
        total_points: 20,
      }),
      athlete({
        athlete_id: "b",
        first_name: "Bea",
        last_name: "Bee",
        total_points: 20,
      }),
      athlete({
        athlete_id: "c",
        first_name: "Cal",
        last_name: "Coe",
        total_points: 10,
      }),
    ];
    const ranks = sectionRanks(athletes, false, false);
    expect(ranks.get("a")).toEqual({ rank: 1, tied: true });
    expect(ranks.get("b")).toEqual({ rank: 1, tied: true });
    expect(ranks.get("c")).toEqual({ rank: 3, tied: false });
  });
});

describe("athleteSubline", () => {
  it("joins place and grade, omitting a missing grade", () => {
    expect(athleteSubline({ rank: 1, tied: false }, "12th")).toBe("1st — 12th");
    expect(athleteSubline({ rank: 2, tied: true }, null)).toBe("T-2nd");
  });
});
```

Use `compareScoredAthletes` with `has40`/`has20` from the **full board columns** (same keys as `scoreTestingDayMatrix`), but only among athletes in the section.

**Step 2: Run to verify fail**

Run: `npx vitest run src/lib/norms/testing-day-pdf-layout.test.ts`

Expected: FAIL (exports missing).

**Step 3: Implement**

Walk the section list (already in board order). A tie is `compareScoredAthletes(a, b, has40, has20) === 0`. Assign competition rank (`1, 1, 3`). `athleteSubline` uses `formatPlace`.

**Step 4: Run tests — PASS**

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf-layout.ts src/lib/norms/testing-day-pdf-layout.test.ts
git commit -m "feat: rank testing-day PDF athletes inside each section"
```

---

### Task 3: F2F PDF helpers (strength, focus, pie)

**Files:**
- Create: `src/lib/norms/testing-day-pdf-f2f.ts`
- Create: `src/lib/norms/testing-day-pdf-f2f.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { F2fProfile } from "./f2f/types";
import type { F2fThemeMix } from "./f2f/themes";
import {
  f2fFocusBadge,
  f2fPieSlices,
  f2fStrengthDeficiency,
} from "./testing-day-pdf-f2f";

const vertex = (predicted_40: number) => ({
  predicted_40,
  extrapolated: false,
  projected: false,
});

const profile = (partial: Partial<F2fProfile>): F2fProfile => ({
  reference_40: 5,
  reference_source: "actual_40",
  explosion: vertex(5.1),
  force: vertex(5.2),
  form: vertex(4.9),
  eligible_for_labels: true,
  flags: ["force"],
  primary: "force",
  ...partial,
});

describe("f2fStrengthDeficiency", () => {
  it("paints fastest green and slowest red", () => {
    expect(f2fStrengthDeficiency(profile({}))).toEqual({
      explosion: null,
      force: "deficiency",
      form: "strength",
    });
  });

  it("shares a color on a two-way tie and skips a three-way tie", () => {
    expect(
      f2fStrengthDeficiency(
        profile({
          explosion: vertex(5.0),
          force: vertex(5.0),
          form: vertex(5.2),
        })
      )
    ).toEqual({
      explosion: "strength",
      force: "strength",
      form: "deficiency",
    });
    expect(
      f2fStrengthDeficiency(
        profile({
          explosion: vertex(5.0),
          force: vertex(5.0),
          form: vertex(5.0),
        })
      )
    ).toEqual({ explosion: null, force: null, form: null });
  });

  it("ignores missing vertices", () => {
    expect(
      f2fStrengthDeficiency(profile({ force: null, form: vertex(4.9) }))
    ).toEqual({ explosion: "deficiency", force: null, form: "strength" });
  });
});

describe("f2fFocusBadge", () => {
  it("is male-only and uses Develop Top-End for Form", () => {
    expect(f2fFocusBadge(profile({ primary: "form" }))).toEqual({
      text: "Develop Top-End",
      tone: "form",
    });
    expect(f2fFocusBadge(profile({ primary: "explosion" }))).toEqual({
      text: "Develop Explosion",
      tone: "explosion",
    });
    expect(f2fFocusBadge(profile({ primary: "force" }))).toEqual({
      text: "Develop Force",
      tone: "force",
    });
    expect(
      f2fFocusBadge(profile({ eligible_for_labels: false, primary: "force" }))
    ).toBeNull();
    expect(f2fFocusBadge(profile({ primary: "balanced" }))).toBeNull();
    expect(f2fFocusBadge(undefined)).toBeNull();
  });
});

describe("f2fPieSlices", () => {
  it("omits zeros and percents against eligible_count", () => {
    const mix: F2fThemeMix = {
      explosion: 8,
      force: 12,
      form: 0,
      balanced: 5,
    };
    expect(f2fPieSlices(mix, 25)).toEqual([
      { key: "balanced", label: "Balanced", count: 5, percent: 20 },
      {
        key: "explosion",
        label: "Explosion-deficient",
        count: 8,
        percent: 32,
      },
      { key: "force", label: "Force-deficient", count: 12, percent: 48 },
    ]);
    expect(f2fPieSlices(mix, 0)).toEqual([]);
  });
});
```

**Step 2: Run to verify fail**

Run: `npx vitest run src/lib/norms/testing-day-pdf-f2f.test.ts`

Expected: FAIL (module not found).

**Step 3: Implement**

`f2fStrengthDeficiency`: collect finite `predicted_40`s; `min` → `"strength"`, `max` → `"deficiency"`; if min === max among ≥3 filled vertices (or all equal), all `null`; two-way min or max may share.

`f2fFocusBadge`: require `eligible_for_labels` and primary in `explosion | force | form`.

`f2fPieSlices`: order Balanced, Explosion-deficient, Force-deficient, Form-deficient; skip count 0; `percent = Math.round((count / eligibleCount) * 100)`.

Export tone colors from this file for the PDF (do not invent 40s):

```ts
export const F2F_FOCUS_COLORS = {
  explosion: "#dc2626",
  force: "#ea580c",
  form: "#ca8a04",
} as const;
export const F2F_STRENGTH_BG = "#bbf7d0";
export const F2F_DEFICIENCY_BG = "#fecaca";
export const F2F_PIE_COLORS = {
  balanced: "#64748b",
  explosion: "#dc2626",
  force: "#ea580c",
  form: "#ca8a04",
} as const;
```

**Step 4: Run tests — PASS**

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf-f2f.ts src/lib/norms/testing-day-pdf-f2f.test.ts
git commit -m "feat: derive PDF Force-to-Form strength, focus, and pie slices"
```

---

### Task 4: Grade on the board + keep athlete `f2f`

**Files:**
- Modify: `src/lib/norms/testing-day.ts` (`TestingDayMatrixAthlete`)
- Modify: `src/lib/norms/testing-day.test.ts` (matrix copies `graduating_class` if you put it on hits — **prefer a stamp helper instead**)
- Modify: `src/lib/norms/testing-day-board.ts` (SELECT + stamp)
- Modify: `src/lib/norms/testing-day-pdf.tsx` (`boardForAudience`)
- Modify: `src/lib/norms/testing-day-pdf.test.ts`

**Do not** add `graduating_class` to every `TestingDayHit` / derived row. After `buildTestingDayMatrix` + score + F2F attach, stamp from a `Map<athlete_id, graduating_class | null>` built from the entry query.

**Step 1: Failing tests**

In `testing-day-pdf-layout.test.ts` or a tiny `testing-day-board` unit if you extract `stampGraduatingClass(athletes, map)`.

Simplest extract:

```ts
// testing-day-pdf-layout.ts or testing-day.ts
export function stampGraduatingClass<
  T extends { athlete_id: string; graduating_class?: number | null },
>(athletes: T[], byId: Map<string, number | null>): T[] {
  return athletes.map((athlete) => ({
    ...athlete,
    graduating_class: byId.get(athlete.athlete_id) ?? null,
  }));
}
```

Test that map values land on the athlete.

Change `boardForAudience` test: athlete **keeps** `f2f`, still strips `tests`, `f2f_themes`, and poor zones.

```ts
expect(athlete.matrix.athletes[0].f2f).toEqual(annF2f);
```

**Step 2: Run** `npx vitest run src/lib/norms/testing-day-pdf.test.ts` — FAIL on `f2f` expect.

**Step 3: Implement**

- `TestingDayMatrixAthlete.graduating_class?: number | null`
- `BoardEntryRow.graduating_class: number | null`
- SQL: add `a.graduating_class` to the entries SELECT
- After F2F attach (or after score if F2F throws):

```ts
const classByAthlete = new Map<string, number | null>();
for (const row of rawEntries) {
  if (!classByAthlete.has(row.athlete_id)) {
    classByAthlete.set(row.athlete_id, row.graduating_class ?? null);
  }
}
data.matrix = {
  ...data.matrix,
  athletes: stampGraduatingClass(data.matrix.athletes, classByAthlete),
};
```

- `boardForAudience`: stop setting `f2f: undefined`.

**Step 4: Run**

`npx vitest run src/lib/norms/testing-day-pdf.test.ts src/lib/norms/testing-day.test.ts src/lib/norms/f2f/board.test.ts`

Expected: PASS (`boardForAudience` assertion updated; other board tests still pass).

**Step 5: Commit**

```
git add src/lib/norms/testing-day.ts src/lib/norms/testing-day-board.ts src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf.test.ts src/lib/norms/testing-day-pdf-layout.ts src/lib/norms/testing-day-pdf-layout.test.ts
git commit -m "feat: keep athlete Force-to-Form on PDFs and plumb graduating class"
```

---

### Task 5: Document chrome — portrait sections, new header, no footer

**Files:**
- Modify: `src/lib/norms/testing-day-pdf.tsx`
- Modify: `src/lib/norms/testing-day-pdf.test.ts`

**Step 1: Update render tests to the new chrome (they should fail)**

Replace the coach “includes Force-to-Form…” assertions that depend on session copy. For this task only, assert chrome:

```ts
it("uses portrait section headers and no footer", async () => {
  const buf = await renderTestingDayPdf({ board: poorBoard, audience: "coach" });
  const text = pdfVisibleText(buf);
  const raw = buf.toString("latin1");
  expect(text).toContain("Testing Day: Girls Volleyball");
  expect(text).toContain("September 2nd, 2026 — 1 Athlete");
  expect(text).not.toContain("Testing-day summary");
  expect(text).not.toContain("LCA Speed Journal — testing-day report");
  expect(raw).toContain("/MediaBox [0 0 612 792]"); // portrait letter
});
```

Empty board: still `%PDF`; may show `Testing Day:` + date + `No entries for this session.`

**Step 2: Run** `npx vitest run src/lib/norms/testing-day-pdf.test.ts`

Expected: FAIL (old landscape header/footer still render).

**Step 3: Implement chrome only**

- `Page size="LETTER"` **no** `orientation="landscape"` (portrait is default).
- Remove `footer` style usage.
- `groupAthletesBySection(board.matrix.athletes)`.
- Each section: `<Page wrap>` starting with `sectionHeading` + `sectionSubhead`.
- Empty athletes: one page, `No entries for this session.`
- Leave old table/F2F internals working **inside** each section (filter athletes + filter `tests` groups / `f2f_themes.groups` to that sport · gender). Drop `f2f_themes.session` from the coach F2F block now so later tasks do not fight it.

Filter tests: map each test’s `groups` to the section’s sport · gender, or keep full `CoachSummaries` only for groups matching the section.

**Step 4: Run PDF tests — PASS for the new chrome test.** Existing F2F string tests will fail until Task 6–7; **update those tests in this step** to drop session-only expectations:

- Do **not** expect `the gap is Force, not speed` (session).
- Still expect `Volleyball takeaway` (group note) until Task 6 replaces mix lines — if you already removed mix lines, keep `Volleyball takeaway` / `Roster is Force-deficient`.
- Athlete PDF: still no group theme note, no `Force-to-Form` heading.

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf.test.ts
git commit -m "feat: section testing-day PDFs by sport in portrait"
```

---

### Task 6: Table cells — subline, zone badges, coach F2F colors

**Files:**
- Modify: `src/lib/norms/testing-day-pdf.tsx`
- Modify: `src/lib/norms/testing-day-pdf.test.ts`

**Step 1: Failing PDF assertions**

Add a boy with `graduating_class: 2027` and efficient VJ to a small board (or extend `poorBoard` with a second athlete in soccer M). Assert:

```ts
expect(text).toContain("1st — 12th"); // freeze date in formatPdfGrade tests already; for PDF, pass graduating_class and stub "now" OR assert "1st" and "12th" separately if school-year is current
expect(text).toContain("efficient");
expect(text).not.toMatch(/soccer · M|volleyball · F/);
```

For coach F2F columns on **page 1 table** (not the old number-wall block): Ann’s form `4.90*` is strength (green conceptually), force `5.20` deficiency. Assert those numbers appear **near the main table** (they may also appear on cards later). Athlete PDF still must **not** contain `4.90*`.

Zone badge: render a `View` with `backgroundColor: cell.zone_color` and white/dark `Text` of `zone_label` when `isLiveLeaderboardZone(cell.zone_label)`. Coach poor stays gray text without a badge.

Name cell: `athleteSubline(sectionRanks.get(id), formatPdfGrade(athlete.graduating_class))`.

Coach-only extra columns after test columns: Explosion / Force / Form. Cell background `F2F_STRENGTH_BG` / `F2F_DEFICIENCY_BG`. Value `fmtPredictedForty`.

**Grade in PDF tests:** `formatPdfGrade` uses `new Date()` at render. Either export a `now` argument through `renderTestingDayPdf` **or** assert only `1st` + skip `12th` in the PDF buffer and rely on unit tests for grade. Prefer optional `now?: Date` on `renderTestingDayPdf` / document props, default `new Date()`, used only by tests.

**Step 2: Run PDF tests — FAIL** on `1st — 12th` / missing F2F table columns.

**Step 3: Implement table rendering** as specified.

**Step 4: PASS**

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf.test.ts
git commit -m "feat: badge testing-day PDF zones and color Force-to-Form cells"
```

---

### Task 7: Athlete focus badge + coach F2F page

**Files:**
- Modify: `src/lib/norms/testing-day-pdf.tsx`
- Create: `src/lib/norms/testing-day-pdf-triangle.tsx` (react-pdf `Svg` port of `F2fTriangle` geometry; call `vertexRadius` — do not invent 40s)
- Modify: `src/lib/norms/testing-day-pdf.test.ts`

**Step 1: Failing tests**

Boy, `primary: "form"`, `eligible_for_labels: true`:

```ts
expect(athleteText).toContain("Develop Top-End");
expect(athleteText).not.toContain("Force-to-Form");
expect(athleteText).not.toContain("Roster is");
```

Girl Ann: `not.toContain("Develop Force")`.

Coach:

```ts
expect(text).toContain("Roster is Force-deficient");
expect(text).toContain("Volleyball takeaway"); // group note
expect(text).not.toContain("the gap is Force, not speed");
expect(text).not.toContain("Mix:");
expect(text).not.toContain("Top 3:");
expect(text).toContain("Force-deficient 1 (100%)");
expect(text).toContain("Ref 40");
expect(text).toContain("Ann Aye");
```

**Step 2: Run — FAIL**

**Step 3: Implement**

- Athlete name cell: if `f2fFocusBadge(athlete.f2f)` and audience is athlete, badge with `F2F_FOCUS_COLORS[tone]`.
- Coach later page(s) in the same section (`minPresence` / new `Page` if the table was page 1 — use a second `Page` per section for F2F so the table stays alone):
  - Title optional `Force-to-Form`
  - `group.note`
  - Pie: `Svg` + `Path` from `f2fPieSlices`; legend `Label count (percent%)`
  - Top 6 of `section.athletes` (already sorted): two rows of three cards — name, `f2fChipLabel(primary)` if eligible, `PdfF2fTriangle`, `Ref 40 {fmtForty}`, three predicted 40s
- Delete `CoachF2fMixLines` and the old all-roster F2F number table.
- `eligible_count === 0`: `No Force-to-Form labels yet.`

Triangle: copy axes/size from `src/app/reporting/testing-day/F2fTriangle.tsx`, stroke `#666`, fill `#93c5fd`.

Pie path helper can live in `testing-day-pdf-f2f.ts` (`pieSlicePath(cx, cy, r, startFrac, endFrac)`) with a small unit test that the path starts with `M` and contains `A`.

**Step 4: PASS**

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf-triangle.tsx src/lib/norms/testing-day-pdf-f2f.ts src/lib/norms/testing-day-pdf-f2f.test.ts src/lib/norms/testing-day-pdf.test.ts
git commit -m "feat: add testing-day PDF focus badges and Force-to-Form cards"
```

---

### Task 8: Fillable notes + regression

**Files:**
- Modify: `src/lib/norms/testing-day-pdf.tsx`
- Modify: `src/lib/norms/testing-day-pdf.test.ts`

**Step 1: Failing test**

```ts
it("embeds a fillable notes field", async () => {
  const coach = await renderTestingDayPdf({ board: poorBoard, audience: "coach" });
  const athlete = await renderTestingDayPdf({
    board: poorBoard,
    audience: "athlete",
  });
  expect(coach.toString("latin1")).toContain("/AcroForm");
  expect(athlete.toString("latin1")).toContain("/AcroForm");
  expect(pdfVisibleText(coach)).toContain("Coach notes");
  expect(pdfVisibleText(athlete)).toContain("Team notes");
});
```

**Step 2: Run — FAIL** (no AcroForm)

**Step 3: Implement**

Import `TextInput` from `@react-pdf/renderer`. Last page of each section (coach: after cards; athlete: after table, same page if it fits, else new page):

```tsx
<Text style={styles.notesLabel}>
  {audience === "coach" ? "Coach notes" : "Team notes"}
</Text>
<TextInput
  name={`notes-${audience}-${themeGroupKey(section.sport, section.gender)}`}
  multiline
  fontSize={10}
  style={{ height: 84, borderWidth: 1, borderColor: "#999999", padding: 4 }}
/>
```

Leave `defaultValue` empty.

**Step 4: Run**

```
npx vitest run src/lib/norms/testing-day-pdf.test.ts src/lib/norms/testing-day-pdf-layout.test.ts src/lib/norms/testing-day-pdf-f2f.test.ts src/lib/norms/testing-day.test.ts src/lib/norms/f2f
```

Then: `npx vitest run`

Expected: all passing.

**Step 5: Commit**

```
git add src/lib/norms/testing-day-pdf.tsx src/lib/norms/testing-day-pdf.test.ts
git commit -m "feat: add fillable notes fields to testing-day PDFs"
```

---

### Task 9: Manual check (do not commit)

On `/reporting/testing-day` (webpack `next dev --webpack` if Turbopack OOMs):

1. Mixed session: Download coach PDF — new section per sport · gender, portrait, no footer, table then F2F, pie percents, six cards, fillable coach notes.
2. Same session: athlete PDF — `1st — 12th`, zone badges, boy `Develop …` badge, no pie/cards, fillable team notes.
3. Open both in a PDF reader and type into the notes field.

If AcroForm is missing, `@react-pdf/renderer` `TextInput` is not registered — fix before claiming done.

---

## Out of scope

- Web F2F UI, female XPE labels, persisting PDF notes to `f2f_theme_notes`
- Committing `next.config.ts` turbopack pin
- Merging or pushing unless asked
