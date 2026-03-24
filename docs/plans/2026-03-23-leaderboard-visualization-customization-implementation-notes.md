# Leaderboard Visualization Customization Implementation Notes

Date: 2026-03-23
Status: Implemented

## Final Control Behavior

- Controls are global for the leaderboard page.
- `Top N` applies to all leaderboard render modes when enabled.
- `Wide mode` increases card density and allows full-width usage.
- `Split gender columns` is only available when `Group by gender` is enabled.
- Default behavior is preserved when all new toggles are off.

## Mode Precedence and Gating

- Split-gender-columns mode is active only when:
  - `groupByGender === true`, and
  - `splitGenderColumns === true`.
- If `Group by gender` is turned off, split-gender-columns is disabled and reset off.
- In split-gender mode, column content is derived from composed sections so alumni splits remain correct.

## Name Compaction in Dense Split Layout

- In the specific dense case (`wide mode` + `split gender columns`), card names use compact formatting.
- This matches the mobile-style display convention to reduce truncation pressure.
- Other desktop modes keep existing default name behavior.

## Manual QA Checklist

- Default mode unchanged on first load.
- `Top N` truncates in ungrouped, grouped, and split-column modes.
- Wide mode increases horizontal usage and card density.
- Grouped + split-column + split-alumni renders athlete/alumni correctly in both gender columns.
- Dense split layout uses compact names and avoids right-edge clipping for long names.
- Loading, polling updates, and error handling remain functional.
