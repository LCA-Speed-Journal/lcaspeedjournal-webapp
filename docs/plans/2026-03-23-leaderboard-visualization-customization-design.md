# Leaderboard Visualization Customization Design

Date: 2026-03-23
Owner: Coaching app web client
Status: Approved design

## Goal

Improve live practice leaderboard readability and screen usage with configurable display behavior while preserving current defaults and avoiding backend risk.

The customization set should support:

- Limiting displayed athletes with a top-N cutoff.
- A wide-density mode that uses more horizontal space and more cards per row.
- Column-based gender splitting where male/female are shown side-by-side across the width, instead of stacking one section below another.

## Confirmed Decisions

- Scope is global: one control set applies to the whole leaderboard page.
- Top-N applies in all views (grouped and ungrouped).
- Controls are direct toggles/inputs (no preset dropdown).
- Default page behavior remains unchanged (current centered 3-column experience with no top limit).

## Recommended Approach

Use a client-side display transformation layer (UI/view-model only) and keep `/api/leaderboard` unchanged.

This is preferred because it:

- Ships quickly with low regression risk.
- Avoids API branching and additional query contracts.
- Keeps display experimentation independent from ranking/fetch logic.

## Architecture

Add a pure utility module:

- `src/app/leaderboard/displayModes.ts`

This module owns display-focused transformations and class selection. It should not fetch data, mutate React state, or depend on browser APIs.

Proposed function set:

- `clampTopN(value: number): number`
- `applyTopN<T>(rows: T[], topN: number, enabled: boolean): T[]`
- `applyTopNToSections(sections, topN, enabled)`
- `getGridClass(options: { wideMode: boolean }): string`
- `buildGenderColumnModel(options: { male; female; topN; topNEnabled })`

The existing `getLeaderboardSections(...)` remains the baseline section composer. New functions wrap this output for truncation and alternate rendering models.

## Data Flow

For each `ComponentLeaderboard` render:

1. Fetch data exactly as today through SWR.
2. Build base sections via `getLeaderboardSections(...)`.
3. Apply top-N truncation to whichever lists are rendered.
4. Choose rendering mode:
   - Standard sections (current style).
   - Wide mode sections (denser grid + larger content width).
   - Gender split columns (male/female side-by-side columns).

Order matters. Top-N is applied after section composition so truncation reflects visible groups and labels.

## UI Controls

Add global controls near existing filter toggles in `LeaderboardClient`:

- `Top N` checkbox.
- Numeric input for N when enabled.
- `Wide mode` checkbox.
- `Split gender columns` checkbox.

Behavior rules:

- `Split gender columns` is only active when `Group by gender` is checked.
- If `Group by gender` is off, split-gender control is disabled or ignored.
- `Wide mode` controls card density and available width.
- In split-gender mode, wide mode affects inner card grids inside each gender column.

## Layout Behavior

Default mode (all new toggles off):

- Preserve current centered container and `sm:grid-cols-3` card density.

Wide mode on:

- Use wider/full-width content container for the leaderboard surface.
- Increase card density (for example `sm:grid-cols-4`, `lg:grid-cols-5`).

Split gender columns on (with group-by-gender):

- Render a full-width two-column wrapper: left male, right female.
- Each column remains vertically structured and independently truncated by top-N.
- Keep card visuals, rank display, and animations consistent with standard mode.

## Error Handling and Validation

- Keep current loading/error/empty states unchanged.
- Clamp numeric top-N input to a safe range (for example min 1, max 50).
- If top-N is disabled, render complete lists.
- If gender data is absent for one side, render available side without crashing.

## Testing Strategy

Add unit tests for new pure helpers:

- `src/app/leaderboard/displayModes.test.ts`

Cover:

- Top-N truncation behavior (enabled/disabled, valid/invalid N).
- Section truncation consistency.
- Grid class selection for standard vs wide mode.
- Gender column model correctness for balanced/unbalanced male-female counts.

Manual verification:

- Standard mode remains unchanged by default.
- Wide mode uses more horizontal space and increased density.
- Split-gender columns avoids burying one gender in stacked sections.
- Top-N applies in grouped and ungrouped displays.

## Implementation Sequence

1. Create `displayModes.ts` helpers and tests.
2. Add global display state and controls to `LeaderboardClient`.
3. Pass display config into `ComponentLeaderboard`.
4. Apply helper-driven transformations in render branches.
5. Adjust container/grid classes for standard vs wide/split modes.
6. Run unit tests and lint checks.

## Non-Goals

- No API contract changes for leaderboard endpoints.
- No persistence of preferences in local storage in this iteration.
- No preset system or saved profile UI.

## Future Extensions

- Optional local preference persistence.
- Coach presets for meet/practice/screen-type contexts.
- Per-metric override mode if future workflows require it.

## Implementation Outcomes

- Global controls were implemented for top-N, wide mode, and split gender columns.
- Split gender columns now honor alumni partitioning by deriving columns from composed sections.
- Dense split layout now uses compact name formatting to reduce truncation.
