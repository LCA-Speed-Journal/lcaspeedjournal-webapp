# Split Alumni Leaderboard — Design

**Goal:** Add a checkmark toggle “Split alumni” so alumni marks can be shown in a separate leaderboard section(s), with per-section rank (#1, #2, #3…), avoiding direct comparison with current athletes. When both “Group by gender” and “Split alumni” are on, show four sections: Athletes (Boys), Athletes (Girls), Alumni (Boys), Alumni (Girls).

**Scope:** Session (live) leaderboard, Historical leaderboard (cards and bar chart). No API changes.

---

## 1. Approach and data flow

**Approach: client-side only.** The API already returns every row with `athlete_type` (`'athlete' | 'staff' | 'alumni'`). We do not add a new query parameter. When “Split alumni” is on, the client filters the same `rows` (or `male` / `female` when “Group by gender” is on) into athletes vs alumni and renders separate sections with per-section display rank.

**State:** Add `splitByAlumni: boolean` (default `false`) next to `groupByGender` in both `LeaderboardClient` and `HistoricalClient`. The fetch URL is unchanged (we still only add `group_by=gender` when the gender toggle is on). No new API surface.

**Derived sections:**

- **Neither toggle:** One list (current behavior).
- **Split alumni only:** Two sections — “Athletes” (rows where `athlete_type !== 'alumni'`), “Alumni” (rows where `athlete_type === 'alumni'`). Staff stays with athletes. Each section shows #1, #2, #3… by index.
- **Group by gender only:** Two sections — “Boys”, “Girls” (current behavior).
- **Both on:** Four sections, in this order: Athletes (Boys), Athletes (Girls), Alumni (Boys), Alumni (Girls). Each section is the intersection of the two splits (e.g. Athletes (Boys) = `male.filter(r => r.athlete_type !== 'alumni')`), with display rank = index + 1 per section.

Empty sections are not rendered (e.g. if there are no alumni, we don’t show an “Alumni” block).

---

## 2. UI and section labels

**Checkbox:** Add a single checkbox next to “Group by gender”: label **“Split alumni”**, same styling as the existing toggle. Place it immediately after “Group by gender” on both Leaderboard and Historical pages so the two toggles sit together.

**Section headings:** Use the existing “Boys” / “Girls” when only gender is split. When alumni is split, use **“Athletes”** and **“Alumni”**. When both are on, use **“Athletes (Boys)”**, **“Athletes (Girls)”**, **“Alumni (Boys)”**, **“Alumni (Girls)”** so each block is unambiguous.

**Order when both toggles on:** Render in the order above (Athletes first, then Alumni; within each, Boys then Girls). This keeps “Athletes” and “Alumni” as the top-level grouping and matches the mental model of “split by alumni, then by gender within each.”

---

## 3. Touchpoints and behavior

**LeaderboardClient:**  
Add `splitByAlumni` state and checkbox. Pass `splitByAlumni` into `ComponentLeaderboard`. Do not change `buildLeaderboardUrl` (no new query param).

**ComponentLeaderboard (live):**  
Receives `groupByGender` and `splitByAlumni`. From `data?.data` it has `rows`, `male`, `female`. Compute up to four lists:

- If `splitByAlumni && groupByGender`: from `male`/`female` derive `maleAthletes`, `femaleAthletes`, `maleAlumni`, `femaleAlumni` (filter by `athlete_type`). Render four sections with `displayRank={i + 1}`.
- Else if `splitByAlumni`: from `rows` derive `athletes` and `alumni`; render two sections with `displayRank={i + 1}`.
- Else if `groupByGender`: current behavior (Boys / Girls, two sections).
- Else: single list, no `displayRank`.

Animation triggers (e.g. `leaderboardDiff`) continue to run on the same data as today (e.g. on `rows` or on `male`/`female`). We do not change trigger logic for alumni split; at most we may need to ensure the refs used for diffing still see the full `rows`/`male`/`female` so animations are not broken.

**HistoricalClient:**  
Add `splitByAlumni` state and checkbox. When building the cards view, use the same section logic as ComponentLeaderboard: from `rows` or `male`/`female` derive athletes vs alumni (and when both toggles on, four groups). Render section headings and cards with per-section `displayRank`. Team averages (e.g. “Men’s Average”) today are over male/female; we do not add separate averages per alumni section in this change (YAGNI).

**HistoricalLeaderboardBar:**  
Add prop `splitByAlumni: boolean`. When only `splitByAlumni` is true, build two datasets from `rows` (athletes, alumni) and render two bar charts with headings “Athletes” and “Alumni”. When both `splitByAlumni` and `groupByGender` are true, build four datasets from `male`/`female` (maleAthletes, femaleAthletes, maleAlumni, femaleAlumni) and render four bar charts with the same section titles as the cards (“Athletes (Boys)”, etc.). When only `groupByGender` is true, keep current behavior (two charts: Boys, Girls). Tooltip rank in each chart is the per-section index + 1. Team average reference lines today are male/female; we do not add per-section averages for alumni in this design.

---

## 4. Edge cases and testing

- **No alumni:** When “Split alumni” is on and there are no alumni, show only the “Athletes” section (or only Athletes (Boys) and Athletes (Girls) when gender is also on). Do not show an empty “Alumni” section.
- **No athletes (only alumni):** If somehow all rows are alumni, show a single “Alumni” section (no empty “Athletes” section). Same idea for the four-way split: only render sections that have at least one row.
- **Missing `athlete_type`:** Treat as athlete (e.g. `(r.athlete_type ?? 'athlete') !== 'alumni'` for the athletes filter) so old or incomplete data still appears in the Athletes section.
- **Manual testing:** Session leaderboard and Historical (cards + bar) with each combination of toggles (off/off, alumni only, gender only, both), with data that has both athletes and alumni, and with data that has only athletes or only alumni. Confirm display ranks are 1, 2, 3… per section and gold/silver/bronze apply per section.

---

## Summary

| Area | Change |
|------|--------|
| LeaderboardClient | Add `splitByAlumni` state + checkbox; pass to ComponentLeaderboard |
| ComponentLeaderboard | Derive athletes/alumni (and when both toggles, four lists); render sections with displayRank |
| HistoricalClient | Add `splitByAlumni` state + checkbox; same section derivation for cards |
| HistoricalLeaderboardBar | Add `splitByAlumni` prop; when on, 2 or 4 charts with correct headings and per-section rank in tooltips |
| API | No change |
