# Live Leaderboard Animations — Design

**Date:** 2026-02-04  
**Scope:** Live leaderboard (`/leaderboard`) only. When new data is pushed (real-time refetch signal), the client diffs previous vs current state and runs Framer Motion animations per card: new entry (fade-in), new to top 3, new PB/SB, value updated. Intensity between subtle and medium; no API changes.

---

## 1. Overview and context

**Goal:** When the leaderboard receives updated data (e.g. after a real-time “refetch” signal from data entry on another device), animate cards so users see what changed: a new name appearing, someone entering top 3, a new PB/SB, or a mark overriding a previous attempt.

**Real-time flow (out of scope for this doc):** A separate mechanism (e.g. SSE or push) will notify the client to refetch. This design assumes the client refetches and then diffs **previous** vs **current** leaderboard payload to decide what to animate. No change to GET /api/leaderboard response shape.

**Approach:** Use **Framer Motion** for layout reorder and per-card variants. Triggers are derived client-side from two snapshots; each card receives at most one trigger per refetch. Triggers clear after a short delay. Allows customization later (e.g. stronger effects, sound).

---

## 2. Data flow and diff

**Where “previous” lives:** In the component that fetches the leaderboard (`ComponentLeaderboard`): keep the last full payload in a **ref** (e.g. `prevDataRef`). When SWR returns new `data`, run the diff against `prevDataRef.current`, then set `prevDataRef.current = data` and pass animation triggers down to cards.

**What we diff:** For the current list (single list or, when grouped by gender, each of male/female independently):

- **New to list:** `athlete_id` appears in current rows but was **not** in the previous snapshot for this metric/component (and segment). Trigger: `"new-entry"`. Used for first attempt pushed, etc.
- **New to top 3:** Rank is now 1–3 and either (a) this athlete was not in the previous top 3, or (b) their rank moved into 1–3. Trigger: `"new-top-three"`. Do not use for rows that are also `"new-entry"` if we treat new-entry as the primary entrance (see below).
- **New PB:** `best_type === "pb"` and the previous row for this `athlete_id` had no `best_type` or a different one. Trigger: `"new-pb"`.
- **New SB:** `best_type === "sb"` and the previous row had no `best_type` or a different one. Trigger: `"new-sb"`.
- **Value updated:** Same `athlete_id` in both snapshots but `display_value` changed (e.g. better 2nd/3rd attempt). Trigger: `"value-updated"`.

**Priority (one trigger per card per refetch):** Prefer the most specific / highest-impact trigger. Suggested order: `new-entry` > `new-top-three` > `new-pb` > `new-sb` > `value-updated`. So a new name that lands in top 3 gets `new-entry` (fade-in); we can optionally add a variant `new-entry-top-three` that combines fade-in with a slight top-3 emphasis.

**Trigger state and clearing:** Store triggers in React state (e.g. `Map<athlete_id, trigger>`). Clear after a timeout (e.g. 1.5–2 s). If another refetch completes before the timeout, run the diff again, replace the map, and reset the timeout. No persistence of triggers across refetches.

**First load / no previous data:** When `prevDataRef.current` is null or undefined, do not run the diff; set no triggers. After the first successful response, set the ref so the next refetch can diff.

---

## 3. Component structure and Framer Motion

**Passing triggers to cards:** The component that renders the list maps current rows to `{ row, trigger }` and passes both into `LeaderboardCard`. Each card receives `row`, `units`, and `animationTrigger` (or null).

**Card:** Wrap the card in `motion.div` with `layout` so when the list reorders, the card animates to its new position. Use **variants** keyed off `animationTrigger`: one variant per trigger type plus a default “idle” variant.

**List:** The grid/list that renders cards is a layout container (e.g. `motion.div` with `layout` or a layout group) so reorders animate smoothly. Keys remain `athlete_id` so Framer can track items across reorders.

**New entry (fade-in):** For rows with trigger `"new-entry"` (or `"new-entry-top-three"`): `initial={{ opacity: 0 }}` (optionally a tiny `y` or `scale` for a subtle “drop in”). `animate={{ opacity: 1, y: 0, scale: 1 }}` with a short transition (e.g. 300–400 ms). The card fades in while `layout` causes the list to reorder around it.

**Dependency:** Add `framer-motion`. Use it only in the leaderboard UI (e.g. `LeaderboardCard` and the grid/list that renders the cards).

**Grouped by gender:** When `groupByGender` is true, maintain a separate prev ref (or a single ref holding `{ male, female }`) and run the diff per list so triggers are correct for each segment.

---

## 4. Variant specs (intensity between subtle and medium)

**`value-updated`** — Subtle: short border/ring pulse (e.g. accent at ~30% opacity, 200–300 ms) then back to default. Optional very slight scale (1 → 1.02 → 1) so the card “ticks” without shifting layout.

**`new-sb`** — Slightly more than value-updated: same idea, slightly longer (e.g. 400 ms) and/or a soft background tint that fades out.

**`new-pb`** — Clearly “something special”: accent or gold border/glow, optional scale 1 → 1.03 → 1 over ~400 ms. Short so it doesn’t dominate.

**`new-top-three`** — Most noticeable: brief glow + small scale bump (e.g. 1.02–1.04). Optional very short “entrance” feel if they just moved into the list’s top 3. Total duration under ~500 ms.

**`new-entry`** — Fade-in only: opacity 0 → 1 (and optional tiny y/scale). Duration 300–400 ms. List reorders via `layout` so the new card appears as others slide.

**`new-entry-top-three`** (optional): New name that lands in top 3. Fade-in plus the same top-3 emphasis (glow/scale) so one variant handles “new name in podium.”

Use a snappy easing (e.g. `easeOut`) so motion feels responsive, not bouncy.

---

## 5. Reduced motion and accessibility

**Reduced motion:** Respect `prefers-reduced-motion: reduce`. Use Framer’s `useReducedMotion()`; when true, set variants to no scale and no glow (or only an instant color change). New-entry can become an instant opacity 0 → 1 or be skipped. Optionally disable or shorten layout animation on the list when reduced motion is on.

**Accessibility:** Do not rely on animation alone to convey “new” or “PB/SB”; existing labels (PB/SB badge, rank) remain the source of truth. Avoid rapid flashing; keep durations and contrast safe. This design is visual-only (no sound).

---

## 6. Error handling and edge cases

- **No previous data:** First load or null ref → no diff, no triggers.
- **Different leaderboard:** User changes session/metric/component → new SWR key and new component instance; fresh ref, no cross-board leakage.
- **Same data:** Refetch returns identical payload → diff yields no changes; trigger map empty or unchanged.
- **Revalidation on focus:** Same as any refetch; diff runs only when data actually changes.
- **Stability:** Use a ref for previous data and state only for the trigger map. Clear trigger map via a single timeout per board; cancel and reset the timeout when a new diff runs.

---

## 7. Testing and verification

- **Manual:** Open leaderboard for a session; from another tab/device add or edit an entry. Trigger refetch (or use real-time). Confirm the correct card(s) get the correct animation and triggers clear after a few seconds. Test new entry (fade-in), new to top 3, new PB/SB, value updated.
- **Diff logic:** Unit-test the diff function in isolation with prev/next row arrays; assert expected trigger per `athlete_id` (e.g. new to list, new to top 3, new PB, value updated). Edge cases: first load (no prev), same data, rank swap, PB appears, value change only.
- **Reduced motion:** Toggle “Reduce motion” in OS or DevTools; refetch with changes; confirm animations are suppressed or minimal (no scale/glow when reduced).
- **Real-time:** When refetch is driven by a push/signal, confirm one refetch per signal and that triggers still match the diff.

---

## 8. Out of scope

- **Real-time transport:** How the client receives the “refetch” signal (SSE, WebSocket, polling) and how the backend broadcasts it are separate. This design only requires that the client refetches and then diffs.
- **API changes:** GET /api/leaderboard and `LeaderboardRow` are unchanged; triggers are derived client-side from two snapshots.

---

## Summary

| Decision | Choice |
|----------|--------|
| How we know what changed | Diff previous vs current snapshot in client after refetch |
| Animation library | Framer Motion (layout + variants) |
| Trigger types | new-entry, new-top-three, new-pb, new-sb, value-updated (optional: new-entry-top-three) |
| New name on board | Fade-in + layout reorder |
| Intensity | Between subtle and medium; ~200–500 ms |
| Triggers cleared | Timeout (e.g. 2 s) after diff; reset on next diff |
| Reduced motion | useReducedMotion(); no scale/glow when set |
