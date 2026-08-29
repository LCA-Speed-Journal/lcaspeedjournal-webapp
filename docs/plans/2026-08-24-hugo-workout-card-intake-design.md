# Hugo Workout-Card Intake (Weight-Room Module)

**Date:** 2026-08-24  
**Campus:** Liberty Hugo  
**Cohort:** Fall S&C (in-season soccer / volleyball / XC + extracurricular)  
**Companion:** [2026-08-24-hugo-workout-card-intake-implementation.md](./2026-08-24-hugo-workout-card-intake-implementation.md)

**Goal:** Coaches print letter-size workout cards, athletes fill them in the weight room, weekly scans become reviewed structured data, and coaches download PDFs (team packets for sport coaches; mid-term extra; individual on demand).

This is **not** the Speed Journal sprint/jump pipeline. Live leaderboard `entries` and public `/reporting` CSV stay as they are. Lift logs live in new tables behind coach PIN.

---

## 1. Decisions and success criteria

Locked in brainstorming (2026-08-24):

| Topic | Decision |
|--------|----------|
| Home | New Weight-Room module in this Next.js app |
| Paper | Blank stack per lift (not pre-named cards). Landscape letter. Same family as Hugo Extracurricular athlete log sheets |
| Identity in the room | Athlete pencils name + sport |
| Identity at scan | Coach places a reusable QR sticker in a printed corner pad |
| Result cells | Keep freeform **Load×Reps** (e.g. `185x5`) |
| Digitized data | Full session log: movements, volume, loads, outputs — plus coach review before save |
| Card creation | Spreadsheet draft → import → in-app editor → batch print. Extra 10-week block imported from existing JSON |
| Capture | Phone photos **or** ADF/scanner PDFs; same review queue |
| Reports | Coach-PIN download only. You send PDFs to sport coaches (no sport-coach login) |
| In-season cadence | Weekly team packet |
| Extra cadence | Mid-term (same engine, longer window) |
| Images | Keep scan blobs through the school year as backup |

**Success criteria**

- Coach can print a stack of identical cards for tomorrow’s lift, with Week/Day, date, focus, exercise grid, name/sport lines, template QR, fiducials, and sticker pad.
- After a weekly scan pass, a review queue shows photo + matched athlete + parsed sets. Confirm writes the log. Unreadable stickers stay unmatched until the coach picks the athlete.
- Soccer / volleyball / XC coaches can be sent a PDF covering last week: who showed up, what was trained, volume, load/output trends.
- Extracurricular athletes can get a mid-term packet that shows progress beyond bar weight (rep-PRs, volume, test outputs).
- Individual athlete PDF download works for either audience.

---

## 2. Architecture

Coach-PIN for every Weight-Room write **and** every report download. Pattern: `getServerSession(authOptions)` as in `src/app/api/athletes/route.ts` and `src/app/data-entry/page.tsx` (`redirect("/login?callbackUrl=...")`).

```
Spreadsheet  →  Card editor  →  Batch print
                                   ↓
                         Athlete fills Load×Reps
                                   ↓
                    Sticker + photo or scanner PDF
                                   ↓
              Decode template QR + sticker QR → vision on known cells
                                   ↓
                         Coach review queue
                                   ↓
                    session_logs + set_results (truth)
                                   ↓
                         Team / individual PDF
```

**Do not** store lifts on `entries`. That table is parsed timing/jump metrics for leaderboards.

**Reuse**

- Auth, `sql` tagged templates (`src/lib/db.ts`), `{ data }` / `{ error }` JSON, SWR on clients, `parseReportingDateRange` for report `from`/`to`.
- Extracurricular session JSON produced by `build_hugo_athlete_log_sheets.py` (copy into the repo; do not port the Python generator).

**New services**

- `@vercel/blob` for scan images (year-long retention).
- QR encode/decode for sticker + template payloads.
- OpenAI vision (structured JSON) behind a narrow `extractCard()` interface so tests mock the model.
- Deterministic `parseLoadReps()` on extracted cell text.
- `@react-pdf/renderer` (or equivalent) for downloadable report PDFs. Cards themselves use HTML + print CSS (landscape letter) so print matches the existing log-sheet look without a second PDF stack.

---

## 3. Data model

### 3.1 Extend `athletes`

Add `hugo_group TEXT` with allowed values `soccer`, `volleyball`, `xc`, `extracurricular`, or NULL (not in Hugo S&C). Grade stays `graduating_class`. Notes stay `athlete_notes`.

Fall cohort names become athlete rows (manual or a later one-time import from `cohort_signups`). Stickers always point at `athletes.id`.

### 3.2 New tables

**`athlete_stickers`**

- `id UUID PK`
- `athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE`
- `payload TEXT NOT NULL UNIQUE` — printed QR contents, e.g. `lca-wr:sticker:<uuid>`
- `active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ`

One active sticker per athlete in v1 (re-print the same payload if the sticker wears out).

**`workout_templates`**

- `id UUID PK`
- `hugo_group TEXT NOT NULL`
- `week_number INTEGER`
- `day_name TEXT` — Monday … Friday (or sport-specific label)
- `session_date DATE NOT NULL`
- `focus TEXT NOT NULL` — e.g. `Upper A`, `In-season lower`
- `title TEXT NOT NULL` — header line on the card
- `layout TEXT NOT NULL DEFAULT 'landscape-letter'`
- `created_at TIMESTAMPTZ`

**`workout_movements`**

- `id UUID PK`
- `template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE`
- `sort_index INTEGER NOT NULL`
- `label TEXT` — `W`, `1`, `1A`, `1B`, …
- `name TEXT NOT NULL`
- `block TEXT NOT NULL` — Warmup, Primer, Main, …
- `set_count INTEGER NOT NULL`
- `targets JSONB NOT NULL` — string[] length = set_count (prescription, not result)
- `notes TEXT`
- `from_pair BOOLEAN NOT NULL DEFAULT false`

**`card_scans`**

- `id UUID PK`
- `blob_url TEXT NOT NULL`
- `template_id UUID REFERENCES workout_templates(id)`
- `athlete_id UUID REFERENCES athletes(id)` — null until matched
- `sticker_payload TEXT`
- `status TEXT NOT NULL` — `uploaded` \| `needs_review` \| `unmatched` \| `confirmed` \| `rejected`
- `extraction JSONB` — raw vision output (cell map)
- `error TEXT`
- `uploaded_at TIMESTAMPTZ`

**`session_logs`** (reviewed attendance unit)

- `id UUID PK`
- `athlete_id UUID NOT NULL REFERENCES athletes(id)`
- `template_id UUID NOT NULL REFERENCES workout_templates(id)`
- `scan_id UUID REFERENCES card_scans(id)`
- `session_date DATE NOT NULL` — denormalized from template for reporting
- `hugo_group TEXT NOT NULL`
- `confirmed_at TIMESTAMPTZ NOT NULL`
- Unique `(athlete_id, template_id)` so a second confirm updates rather than doubles attendance

**`set_results`**

- `id UUID PK`
- `session_log_id UUID NOT NULL REFERENCES session_logs(id) ON DELETE CASCADE`
- `movement_id UUID NOT NULL REFERENCES workout_movements(id)`
- `set_index INTEGER NOT NULL` — 0-based
- `raw_text TEXT` — what was written / extracted
- `kind TEXT` — `load_reps` \| `bw` \| `amrap` \| `output` \| `unknown`
- `load NUMERIC`
- `reps NUMERIC`
- `units TEXT` — `lb` \| `in` \| `m` \| null
- `corrected BOOLEAN NOT NULL DEFAULT false`

Attendance in v1 = existence of a confirmed `session_log` that day. No separate absence checklist.

---

## 4. Printed card

Visual template: extracurricular log sheets (landscape letter, exercise column, per-set **Reps** prescription + **Load×Reps** blank).

**Baked in (not handwritten):** Week-#, Day-#, `MM-DD-YY`, Workout Focus, exercise names, set targets, notes.

**Handwritten:** Athlete name, sport (checkboxes: Soccer / Volleyball / XC / Extra), Load×Reps cells.

**Scan aids**

- Three filled fiducial squares (top-left, bottom-left, bottom-right).
- Top-right **sticker pad** (~1.25 in square) with a thin alignment box and caption “Coach sticker”.
- Small **template QR** (payload `lca-wr:template:<uuid>`) near the header, away from the sticker pad.
- Enough quiet margin for phone photos.

Print **N identical blanks** of one template (page-break per copy). If the grid will not fit one letter page, the editor **blocks** print.

---

## 5. Spreadsheet import

Coaches draft in-season weeks in a CSV (Excel/Sheets → Download CSV). Columns:

```
week,day,session_date,focus,hugo_group,label,name,block,set_count,targets,notes
```

- `session_date`: `YYYY-MM-DD`
- `hugo_group`: `soccer` \| `volleyball` \| `xc` \| `extracurricular`
- `targets`: pipe-separated, one per set (`6 @ RPE 8|6 @ RPE 8|6 @ RPE 8`)
- Rows with the same `(hugo_group, session_date, focus)` belong to one template
- Row-level errors: keep valid rows, return `{ data, errors: [{ row, message }] }`
- After import, open the in-app editor for tweaks, then print

Extracurricular: map copied `extracurricular-sessions.json` (same shape as `hugo_athlete_log_sessions.json`) into templates. Assign `session_date` from a term start date the coach enters at seed time (Week 1 Monday = start, then +0..4 days per weekday).

---

## 6. Scan and review

1. Upload JPEG/PNG or multi-page PDF. Each page → one `card_scans` row + blob.
2. Decode template QR and sticker QR (image may be rotated).
3. If fiducials found, deskew; otherwise still try decode + vision.
4. `extractCard(template, image)` returns `{ cells: { [movementId:setIndex]: string }, warnings: string[] }`.
5. Run `parseLoadReps` on each cell.
6. Status:
   - template + sticker matched → `needs_review`
   - no sticker / unknown payload → `unmatched` (coach picks athlete; handwritten name is a hint)
   - no template QR → coach picks from that calendar day’s templates
7. Review UI: image, athlete (or picker), movement rows with raw + parsed load/reps, confirm / reject.
8. Confirm writes `session_logs` + `set_results`. Flag `corrected` when the coach edited a cell.
9. Warn if this sticker already has a confirmed log for the same template. Warn if OCR’d name (optional, best-effort) disagrees with sticker athlete — coach still decides.
10. Vision or decode failure never auto-saves a log. Empty cells stay empty.

Vision lives behind `src/lib/weight-room/extract-card.ts` with an injectable client. Unit tests feed fixtures; no live API in CI.

---

## 7. Reports

All `GET` report routes require coach session (unlike public Historical / `/api/reporting/*`).

| Packet | Default window | Audience |
|--------|----------------|----------|
| Team | Last calendar week (Mon–Sun) | Soccer / VB / XC coaches |
| Extra mid-term | Coach-picked `from`/`to` | Extra cohort |
| Individual | Same picker | Athlete / parent via coach |

**Team PDF contents (one group)**

- Cover: group, date range, session dates with cards, attendance counts
- Per athlete: days present, movements trained, set volume, parsed volume (sum of reps where parsed), main-lift load snapshots (best parsed load that week vs prior week if any), outputs (CMJ / RM) when `kind = output` or movement name/target indicates a test
- Do not invent numbers. Unparsed cells count toward “sets logged” via raw_text presence only if confirmed

**Individual PDF:** same metrics, one athlete, optional sparkline-style week table (HTML/PDF text table is enough; no Recharts in the PDF).

Empty range: short message in the PDF or 200 JSON `{ error }` with `empty: true` — never a fake leaderboard.

---

## 8. Errors, limits, testing

| Case | Behavior |
|------|----------|
| 401 | Missing coach session on Weight-Room APIs and pages |
| 400 | Bad CSV, unknown `hugo_group`, inverted report dates (reuse `parseReportingDateRange`) |
| Unreadable QR | Unmatched / unknown-template queue |
| Blurry page | `error` on scan; coach re-uploads |
| Duplicate sticker+template | Warn in review; confirm overwrites the unique session_log |
| Vision timeout | Scan stays `uploaded` with `error`; retry extract |
| Print overflow | Editor blocks |
| Report with zero logs | Empty state |

**Tests (Vitest, node env — see `vitest.config.ts`)**

- `parseLoadReps` (x, spaces, lb, BW, AMRAP, inches, garbage)
- CSV grouping + row errors
- QR payload round-trip
- JSON → template movements (one extra Monday fixture)
- Attendance = confirmed logs only
- Report aggregations on a hand-built in-memory fixture (no DB mock required for the pure functions)

**Manual**

- Print one extra Monday card
- Sticker + phone photo
- Review + confirm
- Download one-athlete PDF
- `npm test` and `npm run build`

---

## 9. YAGNI / out of scope (fall v1)

- Athlete phone logging or live in-session entry
- Sport-coach accounts or magic links
- Digit-grid OMR redesign of Load×Reps
- Storing lifts on `entries` or mixing into public `/reporting` CSV
- Roster absence checklist
- Auto-save of unreviewed vision output
- Parent portal
- Porting `build_hugo_athlete_log_sheets.py` into the app

---

## 10. Routes (v1)

Coach-PIN pages:

- `/weight-room` — hub
- `/weight-room/cards` — templates
- `/weight-room/cards/[id]` — editor + print
- `/weight-room/stickers` — roster QR sheet
- `/weight-room/scans` — inbox
- `/weight-room/scans/[id]` — review
- `/weight-room/reports` — download

APIs under `/api/weight-room/*` (all session-gated). Home: add **Weight room** under Manage on `src/app/page.tsx` (next to Data entry / Cohort intake), not under public View.
