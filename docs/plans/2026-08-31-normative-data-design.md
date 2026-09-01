# Normative Data for Speed / Power Tests — Design

**Date:** 2026-08-31  
**Status:** Validated  
**Companion:** [2026-08-31-normative-data-implementation.md](./2026-08-31-normative-data-implementation.md)

**Goal:** Compare live and historical speed/power marks (vertical jump, broad jump, 40yd and splits, med-ball throw) against a coach-editable **current** measuring stick: named populations with sparse colored buckets, shown on the live leaderboard and in reporting, with optional dual-write from weight-room cards after coach confirmation.

---

## 1. Decisions and success criteria

Locked in brainstorming (2026-08-31):

| Topic | Decision |
|--------|----------|
| Where marks live | Speed Journal `entries` (live intake typed in). Weight-room cards can dual-write after review confirmation |
| Default population | Athlete **primary** Hugo sport → `norm_sport_defaults` for that metric. Coach can override **view-time** (`population_id`) to cross-compare |
| Catalog | Named **populations** independent of Hugo groups (soccer 40 → Football Skill) |
| Football | New fall Hugo group (co-op), selectable on roster/cards |
| Table updates | **Live stick** — no versioning. Historical marks use whatever cuts are published now. Zones computed at read time, never stored on `entries` |
| Gender | Always split boys/girls (`M`/`F`). Empty gender rows allowed |
| Labels | Fixed palette, any subset filled. Ordered by **cut value**, not label order. Best earned badge; below/above the easiest cut → no badge |
| Leaderboard | Badge on the mark + colored value + thin accent. Legend. PB/SB and session-to-session unchanged |
| Reporting | Annotate existing summary/CSV **and** a thin testing-day summary (by sport/gender) for sport coaches |
| Editor | In-app, coach PIN. Seed population **structure** (not research numbers) |
| Dual-write | Mapped movement → best `output` that day. **Checklist on scan review** before upsert. One WR-origin Speed Journal session per calendar date |
| 40yd | New cumulative metric `40yd_Dash` with yard labels. Default splits `[10, 10, 20]`. Optional 0-5yd via session custom splits `[5, 5, 10, 20]`. Each component can have its own cuts |

**Success criteria**

- Mixed soccer + volleyball live session: each athlete colored from their own sport’s default table; optional “compare using” forces one table.
- XC (or empty gender) shows rank and value with no badge.
- Editing volleyball VJ cuts immediately changes October marks on historical/reporting.
- Confirming a card never posts a journal mark unless the coach checks it; unmapped outputs can be assigned a metric on the checklist.
- Same-day track Speed Journal session is not the WR dual-write target.

**Out of scope (v1)**

- Versioned / effective-dated tables; snapshotting zone onto the entry
- Sport-coach login
- Card-mapped split 40s
- Position-within-sport facets (WR vs DB as extra keys)
- Weight-room lift PDFs gaining a norms appendix

---

## 2. Architecture

```
Editor (coach PIN)  →  norm_populations / thresholds / sport_defaults
                              ↓
                    zoneResolver(value, metric, component, gender, population)
                              ↓
         Leaderboard API · Historical · Reporting CSV · Testing-day summary

Card review checklist  →  confirm  →  session_logs (always)
                              └→ entries (only posted tests)
                                    session.origin = 'weight_room'
                                    entry.source = 'weight_room'
```

**Reuse:** `sql` tagged templates, `{ data }` / `{ error }`, SWR, `requireCoachSession`, `parseEntry`, `getPrimaryComponent`, leaderboard component filter, session `day_splits` override, Hugo memberships.

**New:** `src/lib/norms/` (palette + resolver + journal-post detection). Do not compute zones inside React cards.

---

## 3. Data model

### Palette (code constant)

| Label | Color (CSS) |
|--------|-------------|
| poor | red (`--zone-poor`) |
| developmental | orange (`--zone-developmental`) |
| efficient | yellow (`--zone-efficient`) |
| advanced | green (`--zone-advanced`) |
| elite | blue (`--zone-elite`) |
| world-class | purple (`--zone-world-class`) |

### Tables

**`norm_populations`** — `id`, `name` UNIQUE, `notes`, `archived_at` NULL, `created_at`.

**`norm_thresholds`** — `population_id`, `metric_key`, `gender` (`M`\|`F`), `component` TEXT NULL (empty string stored as NULL), `label` (palette key), `threshold` NUMERIC. Unique `(population_id, metric_key, gender, COALESCE(component, ''), label)`. No row = empty cell.

**`norm_sport_defaults`** — `hugo_group`, `metric_key` → `population_id`. Unique `(hugo_group, metric_key)`. Missing row = no default (XC).

**`athlete_hugo_memberships.is_primary`** BOOLEAN NOT NULL DEFAULT false. Unique index: one primary per athlete (`WHERE is_primary`). Football added to Hugo CHECK lists.

**`sessions.origin`** TEXT NULL. `weight_room` = auto session for card tests. Coach-created sessions stay NULL.

**`entries.source`** TEXT NULL. `weight_room` = dual-write. Unique index `(session_id, athlete_id, metric_key) WHERE source = 'weight_room'`.

**`workout_movements.speed_journal_metric_key`** TEXT NULL. Must exist in `metrics.json` when set.

### 40yd metric

`40yd_Dash` in `src/lib/metrics.json`: category Speed, `input_structure: cumulative`, `input_units`/`display_units`: `s`, `default_splits: [10, 10, 20]`, `interval_unit: "yd"`.

Parser + `getPrimaryComponent` use `interval_unit` (`m` default, `yd` for this metric) so components are `0-10yd`, `0-20yd`, `0-40yd` (primary), `10-20yd`, `20-40yd`. Do **not** add `10yd_Dash` canonical keys. Do **not** add mph split registry keys; 40yd splits stay seconds on `40yd_Dash`.

Optional 0-5yd: session `day_splits["40yd_Dash"] = [5, 5, 10, 20]` (existing SessionForm custom splits). Adds `0-5yd` and `5-10yd`. Norms for `0-5yd` are optional extra threshold rows.

### Seed

Insert populations **HS Volleyball VJ** and **Football Skill 40yd** if missing. Point volleyball → Vertical Jump; football + soccer → `40yd_Dash`. **Do not seed numeric cuts** (coach enters research in the editor).

---

## 4. Resolver

Pure function: `resolveZone({ value, lowerIsBetter, cuts })` where `cuts` is the filled `{ label, threshold }[]` for one population/metric/gender/component.

1. Ignore empty labels. If none, return `null`.
2. Sort by threshold ascending.
3. Lower-is-better (units `s`): earn a cut when `value <= threshold`. Best = **lowest** label in palette rank among earned (world-class beats elite).
4. Higher-is-better: earn when `value >= threshold`. Best = **highest** palette rank among earned.
5. Palette rank (best → worst): world-class, elite, advanced, efficient, developmental, poor.
6. If nothing earned → `null` (no badge).

`lowerIsBetter` = `display_units === "s"` (same as leaderboard `sortAsc`).

Population selection: if view `population_id` set, use it for everyone. Else `primary hugo_group` + metric → default population. No primary / no default / no gender rows → `null`.

Unknown metric, non-finite value, missing population: return `null`, never throw.

Editor rejects two labels with the same threshold for the same gender/component. If they exist in DB, first match in palette-best order among earned.

---

## 5. Leaderboard and historical

`GET /api/leaderboard` (and historical) unchanged ranking. Optional `population_id`. Each row may include `zone_label`, `zone_color`, `population_name`.

Load current thresholds once per request; resolve per row (athlete gender + memberships + defaults). Norms query failure → omit zone fields.

**Card:** color the value + thin leading accent; chip next to the mark. Unbadged = current styling. PB/SB bottom-left, trend bottom-right. `#1` gold unchanged.

**Legend:** labels present in this result set + “no badge.” Tooltip on chip: `population_name` when mixed sports.

Component picker already exists; `10-20yd` vs `0-40yd` swaps rank and badges.

---

## 6. Reporting

**CSV** (`/api/reporting/export`): append `zone_label`, `population_name` (empty when unbadged). Recompute on current stick.

**Summary UI:** show zone next to marks where the UI already lists values.

**Testing-day summary** (coach PIN): `GET /api/reporting/testing-day?session_id=&metric=&component=&population_id=`. Groups by primary Hugo sport then gender. Per group: headcount, counts per filled label, Efficient+ (palette rank ≥ efficient among **defined** labels for that table), unbadged names+marks. Sport with no default: “no standard” + raw list. Printable page (and PDF if cheap via existing print CSS); not a second analytics product. Weight-room lift PDFs unchanged.

---

## 7. Editor

Route `/norms`, coach PIN, link from Home → Manage and Weight-room hub.

Panes: population list (create/rename/archive); cuts grid (metric + component, boys/girls columns, six rows, empty allowed); sport-defaults matrix (Hugo group × metric → population | none).

APIs under `/api/norms/*`, all `requireCoachSession`. Public leaderboard only **reads**.

Archive blocked while sport defaults still point at the population. Duplicate name → 400. Seed insert-if-missing so remigrate does not overwrite cuts.

**Primary sport:** Hugo teams section: radio/star for primary among checked sports. Football appears in `HUGO_GROUPS`. Dual-sport with no primary → unbadged until set.

---

## 8. Weight-room dual-write

Mapping is opt-in on the template movement (`speed_journal_metric_key`), not a name regex. Submax CMJ stays unmapped.

**Review checklist** (above Confirm):

- Mapped + best output → pre-checked: movement, best mark, metric.
- Output, no map → unchecked; metric dropdown (single-interval / output-friendly registry keys).
- Mapped, no usable output → disabled “no mark.”

Confirm body includes `journal_posts: [{ movement_id, metric_key, post }]`. Server upserts only `post: true` with a live `output` parse. Uses `parseEntry` so VJ stays inches.

**Session:** find-or-create `sessions` where `session_date` = template date AND `origin = 'weight_room'`. Phase `Competition`, `phase_week` 1. Never attach to a NULL-origin session the same day.

**Upsert:** `source = 'weight_room'`. Re-confirm with `post: true` updates that row. `post: false` does not delete a previous WR entry. Live-typed marks (`source` NULL) are separate; leaderboard already takes best.

Lift confirm **always** commits first. Journal errors → `journal_warnings[]` on the JSON response, scan still confirmed.

Split 40s are live-timed in Speed Journal, not card cells.

---

## 9. Errors and tests

See Section 7 of brainstorming (resolver nulls, 400 on bad `population_id`, confirm still saves lifts, Football in `isHugoGroup`).

Vitest covers resolver, 40yd `yd` labels + 0-5yd override, journal-post picker, Football group, leaderboard zone mapper. No live Postgres in unit tests.

---

## 10. Files (expected)

| Area | Path |
|------|------|
| Palette + resolver | `src/lib/norms/palette.ts`, `src/lib/norms/resolve-zone.ts` |
| Journal posts | `src/lib/norms/journal-posts.ts` |
| Migration | `scripts/migrate-normative-data.sql` |
| Metric | `src/lib/metrics.json`, `src/lib/parser.ts`, `src/lib/metric-utils.ts` |
| Football | `src/lib/weight-room/constants.ts` + CHECK SQL |
| Leaderboard | `src/app/api/leaderboard/route.ts`, `LeaderboardClient.tsx`, `src/types/index.ts` |
| Reporting | `src/app/api/reporting/export/route.ts`, new `testing-day` route + page |
| Editor | `src/app/norms/`, `src/app/api/norms/` |
| Dual-write | confirm route, `ReviewClient.tsx`, `insert-template.ts`, card editor |
