# Testing-day PDF redesign — Design

**Date:** 2026-09-04  
**Status:** Validated  
**Companion:** [2026-09-03-force-to-form-design.md](./2026-09-03-force-to-form-design.md)

**Goal:** Make coach and athlete testing-day PDFs sectioned by sport · gender, portrait, with a one-page table, zone badges, useful Force-to-Form (coach) or a single focus word (athlete), and a fillable notes field.

---

## 1. Decisions

| Topic | Decision |
|--------|----------|
| File | One PDF per download (coach or athlete) |
| Split | New section per sport · gender; each section starts a new page |
| Header | `Testing Day: Boys Soccer` (gender word + sport) |
| Subhead | `September 2nd, 2026 — 25 Athletes` (this section’s *n*) |
| Footer | None |
| Page size | Portrait letter |
| Pages per section | Page 1 = table. Later pages = coach F2F and/or notes |
| Rank in name cell | Rank **inside this section**, same sort as today’s scored board |
| Grade | `graduatingClassToGrade` → `9th`–`12th`; omit grade if missing |
| Zone badges | Color badge for efficient / advanced / elite / world-class |
| Athlete PDF zones | Still `forPublicLeaderboard` (hide poor / developmental labels) |
| Athlete F2F word | Boys with a primary deficiency only |
| Coach F2F cells | Keep predicted 40; green = fastest 40, red = slowest 40 |
| Ties (F2F 40s) | Shared green or red; three-way tie uncolored |
| Coach F2F page | Team (group) summary only — no session-wide block |
| Mix display | Pie + percents; drop Mix / Top 3 / Top 5 / Rest text |
| Cards | Top 6 in section table order; two rows of three |
| Notes | `@react-pdf/renderer` `TextInput`, empty, last page of the section |

**Success criteria**

- A mixed session PDF has one section per sport · gender, each with a true header and that group’s athlete count.
- The table for a typical roster fits on one portrait page.
- Athlete handout shows `1st — 12th` and, for a Form-deficient boy, a yellow `Develop Top-End` badge. Girls and balanced athletes have no focus badge.
- Coach table paints strength/deficiency on F2F predicted-40 cells; the F2F page shows the roster note, a four-slice pie, top-6 cards with triangles, and no session theme.
- Opening the PDF in a reader shows an empty fillable notes field (coach-facing vs team-facing).

**Out of scope**

- Changing the web testing-day UI
- Female XPE labels, `/norms` editor, live force-velocity charts
- Multiple files per download, landscape fallback
- Coach notes persisted back into the app (the field is PDF-only)

---

## 2. Document shape

`TestingDayReportDocument` walks **sections**, not one global table.

**Section key:** `sport` + `gender` (`M` / `F` / unknown). Sort sport label A–Z, then boys before girls, then unknown. Hugo groups use `HUGO_GROUP_META` labels. Null sport → `No primary sport`.

**Each section**

1. New page, portrait, no footer.
2. Title: `Testing Day: {Boys|Girls} {sport}` (unknown gender: sport only, or `Testing Day: {sport}`).
3. Subhead: ordinal date from `session_date` + em dash + `{n} Athlete(s)` — *n* is athletes in this section only.
4. Page 1: that section’s table.
5. Coach: existing per-test summary lines may wrap after the table.
6. Coach: Force-to-Form for **this group only** (match `f2f_themes.groups` by sport · gender). Never render `f2f_themes.session`.
7. Last page of the section: fillable notes. Unique field name per section and audience (`notes-coach-soccer-M`) so mixed PDFs do not collide.

Empty session: one page, same header style if a single filter applies, else `Testing Day:` + date, body `No entries for this session.`

Phase can stay off the header; date + count replace today’s date / phase / Coach|Athlete lines.

---

## 3. Table (page 1)

Athletes in the section keep `compareScoredAthletes` order (total points, then 40 rank, then 20 rank, then name). **Section rank** is 1-based in that order; ties on the sort key use `formatPlace(..., true)` (`T-2nd`).

**Name cell**

- Name.
- `{rank} — {grade}` e.g. `1st — 12th`. No em dash when grade is missing.
- Grade: plumb `graduating_class` onto `TestingDayMatrixAthlete` from the board query; `graduatingClassToGrade` at render time.

**Athlete PDF focus badge** (name cell, below the subline)

| Primary | Badge | Color |
|---------|--------|--------|
| Explosion | Develop Explosion | Red |
| Force | Develop Force | Orange |
| Form | Develop Top-End | Yellow |

Show only when `eligible_for_labels` and `primary` is explosion / force / form. `boardForAudience("athlete")` still drops `tests`, `f2f_themes`, and poor/developmental **zone fields**. It **keeps** `f2f` so this badge can render (do not strip the whole profile).

**Metric cells (both PDFs)**

- Mark + place, as today.
- If `zone_label` is efficient, advanced, elite, or world-class: a small filled badge using `zone_color` (palette) and the label. Not gray caption text.
- Athlete: `forPublicLeaderboard` unchanged.
- Coach: poor / developmental remain uncolored text if present.

**Coach F2F columns** (Explosion / Force / Form predicted 40s stay on the table)

- Print `fmtPredictedForty` (`*` if projected).
- Among vertices that have a finite `predicted_40`: min time → green fill (strength); max time → red fill (deficiency).
- One middle value: no fill. Two-way min or max tie: both that color. Three-way equal: no fill.
- Missing vertex: `—`, no fill.
- Girls: same paints (color is not a Villani label).

Helper (pure, unit-tested): given three optional predicted 40s, return `{ explosion: "strength" | "deficiency" | null, ... }`.

---

## 4. Coach Force-to-Form page

Skip entirely on the athlete PDF.

**Header:** that group’s `note` (coach override) or `generated_note` — already `Roster is Force-deficient (12/25). Top 5 are Explosion-deficient.`

**Pie + legend**

- Four categories from `mix`: Balanced, Explosion-deficient, Force-deficient, Form-deficient.
- Denominator = `eligible_count` (labeled males). Percent = `round(100 * count / eligible_count)`.
- Omit zero categories from the legend; empty slices stay out of the pie.
- `eligible_count === 0`: no pie; show `No Force-to-Form labels yet.`
- Draw with `@react-pdf/renderer` `Svg` / `Path`. Fixed slice colors (not zone palette).

No `themeMixLines` (Mix / Top 3 / Top 5 / Rest).

**Top 6 cards**

- Athletes 1–6 in this section’s table order. Fewer than six → fewer cards. Layout: two rows of three.
- Match the web card: name, primary flag (boys / `eligible_for_labels` only), triangle, `Ref 40`, Explosion / Force / Form predicted 40s.
- Triangle: same geometry as `F2fTriangle` (`vertexRadius` + axes), drawn with react-pdf `Svg`. Girls can sit in the six; shape + numbers, no flags.

**Notes field**

- `TextInput` from `@react-pdf/renderer`, multiline, empty default.
- Coach label: coach-facing (e.g. `Coach notes`).
- Athlete PDF (no F2F page): same control, team-facing (e.g. `Team notes`).
- Not written back to `f2f_theme_notes`.

---

## 5. Data and tests

**Board**

- Select `a.graduating_class` with entries; pass through hits → `buildTestingDayMatrix` → `TestingDayMatrixAthlete.graduating_class`.
- No engine / theme formula changes.

**PDF module** (`testing-day-pdf.tsx` + small helpers)

- `groupAthletesBySection`, `sectionTitle`, `formatPdfDate`, `formatGradeOrdinal`, `sectionRanks`, `f2fStrengthDeficiency`, `f2fFocusBadge`, pie percents.
- Prefer helpers in `src/lib/norms/` so tests do not render a full PDF for every case.
- Existing `pdfVisibleText` tests: assert new header / subhead / `1st — 12th` / focus copy / no footer / no session F2F line / roster note present / Mix lines absent.
- `boardForAudience` athlete: `f2f` present, `f2f_themes` absent.

**Verification**

- Download coach + athlete PDF from `/reporting/testing-day` on a mixed session and a single-sport session.
- Confirm portrait, section breaks, fillable notes in a PDF reader.

---

## 6. Non-goals (reminders)

Do not invent predicted 40s in the PDF. Do not label girls. Do not mix populations in one F2F pie. Do not put the table and the top-6 cards on the same page as a requirement.
