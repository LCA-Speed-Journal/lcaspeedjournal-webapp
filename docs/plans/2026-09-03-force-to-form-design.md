# Force-to-Form (F2F) Triangle — Design

**Date:** 2026-09-03  
**Status:** Validated  
**Companion:** [2026-09-03-force-to-form-implementation.md](./2026-09-03-force-to-form-implementation.md) · [2026-09-04-f2f-force-515-reconstruction-design.md](./2026-09-04-f2f-force-515-reconstruction-design.md)

**Goal:** Profile each male athlete’s 40yd qualities — Explosion (standing broad jump), Force (early-acceleration fly), Form (top-end fly) — against Tony Villani / XPE Game-Speed lookup tables, draw a Force-to-Form triangle, and surface team themes so sport coaches know what to train. Primary surface is testing-day reporting; the athlete page keeps the same profile in view through the season.

F2F sits **beside** existing zone badges and James Wild archetypes. Zones answer “how good is this mark vs our table?” Wild is a coach-assigned tag. F2F answers “which **quality** is holding this 40 back?”

---

## 1. Decisions and success criteria

Locked in brainstorming (2026-09-03):

| Topic | Decision |
|--------|----------|
| Stick | XPE lookup tables (one per assessed metric), versioned JSON — not the `/norms` cuts editor |
| Split gaps | Exact table match first. Force 5–15 is looked up on **time**; when only a 5–10 exists, mph-bridge. Form still mph-bridges unmatched flies. See [5–15 reconstruction](./2026-09-04-f2f-force-515-reconstruction-design.md). |
| Reference 40 | Actual `0-40yd` when present; otherwise a **sprint-anchored** projection |
| Partial battery | Two qualities are enough. Missing Form / 40 are projected and flagged |
| Court-sport case | Broad = Explosion; 5–10 (or 20yd) = Force; 10–20yd mph keeps Form and predicted 40 **realistic**. A big jump does not average up a mediocre 20yd |
| Labels | Qualities **3–4% slower** than reference are deficient. One **primary** label (largest gap) plus secondary flags |
| Gender | Males: full labels. Girls: triangle only, no deficiency words, excluded from theme counts |
| Testing-day | Session snapshot only. Triangle strip + themes. Coach PDF includes F2F; athlete PDF does not lecture |
| Athlete page | Same engine. Toggle: **Full-test** / **Best** / **Latest**. Best and Latest are labeled *composed* |
| Team themes | Whole-group mix, then top 3 / top 5 vs the rest, by sport · gender. “Best” = actual 40, else predicted 40 (not combine points) |
| Theme notes | Computed stats stay canonical. Interpretive sentence is coach-editable per group (+ session-wide), persisted on the session |
| Architecture | Pure engine in `src/lib/norms/f2f/`. Testing-day board builder attaches profiles. Athlete API is a second reader |

**Success criteria**

- A testing-day 40 with 5–10 and 20–40 plus a broad jump produces a labeled triangle and a primary quality.
- A court athlete with only 20yd + broad jump still gets Explosion, Force, projected Form, and a projected 40 that tracks the 20yd / 10–20, not the jump.
- Girls show a shape without “Force-deficient.”
- Coach can rewrite “the gap is Force, not speed” and see that wording on reload and on the coach PDF.
- Athlete page Full-test matches the last testing-day profile; Best / Latest are visibly composed.

**Out of scope (v1)**

- Coach-editable XPE rows in `/norms` (tables are a published stick)
- Female XPE table and girls’ deficiency labels
- Mixing F2F into live leaderboard cards or zone palette
- Historical effective-dating of tables (current JSON is the stick)
- Weight-room lift PDFs gaining an F2F appendix

---

## 2. Architecture

```
XPE JSON tables  →  f2f/resolve (pure)
                         ↓
entries (session or athlete window)
                         ↓
              predicted 40s, reference, flags
                    ↙              ↘
     testing-day board          GET /api/athletes/:id/f2f?mode=
     + theme sentences                 ↓
              ↓                  athlete dashboard toggle
     theme notes PATCH → session
              ↓
     coach PDF (stats + saved notes)
```

Reuse: `mphFromYardSplit` / `yardsInFortyComponent` (`src/lib/norms/forty-yd.ts`), `buildTestingDayBoard`, testing-day PDF (`@react-pdf/renderer`), athlete dashboard sections, `requireCoachSession` for note writes.

New: `src/lib/norms/f2f/` (tables + resolver + classify + themes + mark pickers). Do not compute predicted 40s inside React cards or the PDF.

---

## 3. Engine and tables

### Tables

Versioned JSON in `src/lib/norms/f2f/`:

| File | Quality | Input |
|------|---------|--------|
| `broad-jump.json` | Explosion | distance (ft) → predicted 40 |
| `fly-5-15.json` | Force | split seconds + mph → predicted 40 |
| `fly-20-40.json` | Form | split + mph → predicted 40 |
| `fly-30-40.json` | Form | split + mph → predicted 40 |
| `fly-20-30.json` | Form | split + mph → predicted 40 |

Each file has a `meta` block (source, date, population: male football ~175lb+) and rows. Updating the stick is a data commit.

At module load, fit mph → predicted-40 curves per quality from the fly tables (Force from 5–15; Form from the three fly tables, preferring exact-split table when the split matches).

### Mark → predicted 40

1. Exact table + exact split: interpolate neighboring rows.
2. Force: timed `5-15yd`, else reconstruct 5–15 from 5–10+10–20 (constant *a* 5–20, Villani by time), else 5–10 mph, else 0–20 stand-in. Form unmatched flies: mph → Form curve.
3. Broad jump: distance → predicted 40, interpolate; light regression only between rows.
4. Outside table range: clamp and mark `extrapolated`.
5. Missing / non-finite mark: that vertex is absent (or projected — see below). Never throw.

### Profile inputs

| Quality | Preferred | Fallback |
|---------|-----------|----------|
| Explosion | `Standing-Broad` | — |
| Force | Timed `5-15yd`, else reconstructed 5–15 from `5-10yd`+`10-20yd`, else `5-10yd` mph | 20yd (`0-20yd`) as Force stand-in |
| Form | `20-40yd`, `30-40yd`, or `20-30yd` | 10–20yd mph as Form proxy |
| Reference 40 | Actual `0-40yd` | Sprint-anchored projection |

**Sprint-anchored projection:** a large Explosion predicted-40 does **not** average with a slower 20yd. Predicted 40 and missing Form stay tied to the sprint (20yd time and 10–20yd as the realism check). The jump still plots as Explosion and may show as a strength.

Missing vertices are estimated and flagged `projected: true`.

### Classify (males only)

Band: predicted 40 **3–4% slower** than reference (~0.15–0.20s on a 5.00). Implementation constant: `DEFICIENCY_BAND = 0.035` (midpoint), documented as 3–4%.

- Every quality outside the band → `flags[]`.
- **Primary** = largest relative gap: `balanced` \| `explosion` \| `force` \| `form`.
- Secondary flags ride along (`Force-Deficient, also Explosion`).
- `primary` is `null` when `eligible_for_labels` is false (girls, unknown gender, or fewer than two qualities).
- Balanced = nothing outside the band.

### Triangle scale

- Center (origin): **10% slower** than reference 40.
- Outer bound: **10% faster** than reference 40.
- Each vertex is that quality’s predicted 40 mapped onto its axis.
- Projected vertices: dashed / hollow.

---

## 4. Testing-day payload and UI

`GET /api/reporting/testing-day` remains the only session reader. After the current matrix (including derived 20yd / Max V), `buildTestingDayBoard` runs the engine once per athlete on **that session’s marks**.

```ts
athlete.f2f: {
  reference_40: number
  reference_source: "actual_40" | "projected"
  explosion: F2fVertex | null
  force: F2fVertex | null
  form: F2fVertex | null
  flags: ("explosion" | "force" | "form")[]
  primary: "balanced" | "explosion" | "force" | "form" | null
  eligible_for_labels: boolean
}

type F2fVertex = {
  predicted_40: number
  input: { metric_key: string; component: string | null; value: number; units: string }
  projected: boolean
  extrapolated?: boolean
}
```

Matrix columns are unchanged. F2F is extra on the row.

**On-screen (coach, primary surface)**

- Ranked table unchanged.
- **Triangle strip** under the table: cards grouped sport · gender (same buckets as today’s summaries). Name, primary chip, secondary flags, reference 40, three predicted 40s (projected in muted type), small triangle.
- Girls / ineligible: shape only, no chips.

**Team themes** (coach only), per sport · gender, plus one session-wide line:

- Full-group mix of primary labels.
- Top 3 and top 5 vs the rest.
- Rank for “best”: actual 40, else predicted 40 (not `total_points`).
- Ineligible athletes appear on the strip but are **out of theme counts**.

Generated example: *Boys soccer — roster is Force-deficient (8/14). Top 5 are Form-strong; the gap is Force, not speed.*

**Theme note override**

- Counts and contrasts stay computed.
- The interpretive clause (“the gap is Force, not speed”) is editable per sport · gender and session-wide.
- `PATCH` (coach auth) persists on the session (`session_f2f_theme_notes` or JSON on `sessions`), keyed by session + sport + gender.
- Empty note → generated sentence. PDF uses saved note when present.

**PDFs**

- **Coach:** after current summaries, F2F block — theme sentences (with overrides), then a tight table (name, primary, flags, reference, three predicted 40s). Tiny triangles only if they stay readable in landscape; otherwise table-only.
- **Athlete:** no themes, no deficiency words. Omit F2F or show an unlabeled triangle so we do not imply a football-norm verdict.

---

## 5. Athlete page

New dashboard block, next to (not mixed with) James Wild archetypes.

| Mode | Marks | Badge |
|------|--------|--------|
| **Full-test** | Last testing-day snapshot | Official — matches that report |
| **Best** | Best Explosion, Force, Form, and 40 in the window | Composed |
| **Latest** | Most recent mark per quality | Composed |

Testing-day itself is Full-test only. Window defaults to the current school year. `GET /api/athletes/:id/f2f?mode=full-test\|best\|latest` returns the same `f2f` shape, plus `mode`, `as_of` (Full-test session date), and each vertex `session_date` in composed modes.

Sprint-anchored rules still apply when composing. Girls: triangle, no labels. No team themes on this page.

---

## 6. Gaps and errors

| Situation | Behavior |
|-----------|----------|
| No usable quality | No triangle; “needs a jump or sprint.” |
| One quality | Show that vertex + predicted 40; `primary` null |
| Two qualities | Project missing Form/40; dashed vertices; males may classify |
| No actual 40 | `reference_source: "projected"`; classify against it |
| Girls / unlabeled | Shape only; excluded from themes |
| Outside table range | Clamp + `extrapolated` |
| Engine / table load fail | Omit F2F; board and athlete page still work (same as zone-query failure) |

---

## 7. Tests

Pure tests in `src/lib/norms/f2f/`:

- Lookup + interpolate; mph bridge (5–10 → Force curve; 10–20 → Form curve).
- Sprint-anchored: big broad + mediocre 20yd does not average up the reference.
- 3–4% band; primary = worst gap; secondary flags retained.
- Girls: vertices, `primary == null`.
- Themes: mix, top 3/5 vs rest, unlabeled omitted; note override wins on PDF input.
- Mark pickers: Full-test / Best / Latest choose the intended entries.

---

## 8. Implementation order (suggested)

1. Ingest XPE JSON + `resolveMark` / interpolate / mph curves + unit tests.
2. `buildProfile` (inputs, sprint-anchored reference, classify) + tests.
3. Attach `f2f` on the testing-day board; triangle strip + theme sentences on `/reporting/testing-day`.
4. Theme note PATCH + coach PDF F2F block.
5. Athlete `GET /f2f` + dashboard toggle (Full-test / Best / Latest).
6. Wire tables from the collected XPE files (conversion script if the source is spreadsheet).

Ready for an implementation plan once the XPE table files are in-repo (or a path to them is known).
