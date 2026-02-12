# Group-by-gender display rank (design)

**Date:** 2026-02-11

## Summary

When "Group by gender" is enabled on the session leaderboard or historical leaderboard, the women's list currently shows absolute rank (e.g. #4, #5, #6). This design changes the **displayed** rank to be relative to each gender: Boys show #1, #2, #3… and Girls show #1, #2, #3… with gold/silver/bronze styling applied per section. When the checkbox is off, behavior is unchanged (absolute rank everywhere).

## Scope

- **Visual only.** No API or type changes; backend continues to return absolute rank.
- **Display rank** when grouped = position in that gender’s list (index + 1). Use this for the rank badge, `rankClass()` (gold/silver/bronze), and any “1st place” name styling.
- **Animations** (e.g. `leaderboardDiff`, “new entry in top 3”) remain based on absolute rank; no changes to trigger logic.

## Approach

- When rendering the **grouped** view (Boys / Girls), use **index + 1** in each list as the display rank for badge, `rankClass`, and first-place styling.
- When **not** grouped, keep using `row.rank` everywhere.
- Touchpoints: LeaderboardClient (session leaderboard cards), HistoricalClient (historical cards), HistoricalLeaderboardBar (bar chart tooltip rank).

## Component changes

### LeaderboardClient.tsx

- In the grouped branch, change `male.map((r) => ...)` and `female.map((r) => ...)` to use index: `(r, i)` and set `displayRank = i + 1`.
- Use `displayRank` for: badge text (`#${displayRank}`), `rankClass(displayRank)`, and “1st place” name styling (check `displayRank === 1` instead of `row.rank === 1`).
- **LeaderboardCard:** Add an optional prop `displayRank?: number`. When provided, use it for badge, `rankClass`, and gold text; otherwise use `row.rank`. When rendering the grouped view, pass `displayRank={i + 1}` (or equivalent) from the parent.

### HistoricalClient.tsx

- In the grouped view, use `male.map((r, i) => ...)` and `female.map((r, i) => ...)` with `displayRank = i + 1`.
- Use `displayRank` for the card’s rank badge and `rankClass(displayRank)`. No shared card component here—update the two map callbacks to use `i + 1` for rank display and styling.

### HistoricalLeaderboardBar.tsx

- In the `groupByGender` branch, when building `boysData` and `girlsData`, set `rank: i + 1` from the map index instead of `rank: r.rank`, so tooltips show "#1", "#2", etc. per section.

## Edge cases

- **Ungrouped view:** No change; continue using `row.rank` everywhere.
- **Animations:** No change to `leaderboardDiff.ts` or the effect that computes triggers; they remain absolute-rank based.
- **Empty section:** If one gender has no athletes, the other section still uses index + 1 (1, 2, 3…) for its list; no special handling.

## Out of scope

- API or response shape changes.
- Ordinal labels ("1st", "2nd", "3rd"); we keep "#1", "#2", "#3".
- Per-gender animation triggers (e.g. "new entry in top 3 for Girls").
