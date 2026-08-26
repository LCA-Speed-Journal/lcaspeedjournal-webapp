# BTSN On-the-Spot Athlete Create — Design

**Date:** 2026-08-25  
**Companion:** [2026-08-25-btsn-quick-athlete-create-implementation.md](./2026-08-25-btsn-quick-athlete-create-implementation.md)

**Goal:** At Back-to-School Night, staff can create a new person from the data-entry Athlete field (name, M/F, alumni/staff, optional grade) without leaving the form, then log Vertical Jump as usual for the live leaderboard.

This is **not** a new guest table, BTSN mode, or leaderboard change. Walk-ups become real `athletes` rows so ranking, gender split, and alumni split keep working.

---

## 1. Locked decisions

Brainstorming (2026-08-25):

- Create **immediately** from an “Add [typed name]…” row. Jump save stays a separate step.
- **Always** show Add at the bottom whenever the search box has text, even if roster matches exist (same-name walk-ups).
- Inline panel under the Athlete field (not a modal or popover): First, Last, M/F, Alumni/staff checkbox, optional Grade 9–12.
- Name pre-fill: split the typed query on the **first space**. One-word names leave Last blank. First and Last are required.
- Unchecked Alumni/staff → `athlete_type: "athlete"`. Checked → `athlete_type: "alumni"` (Alumni board). Grade only when unchecked.
- Grade is optional and does not affect ranking. Convert 9–12 to `graduating_class` from the current school year (August 2026: 12→2027, 11→2028, 10→2029, 9→2030).
- New rows are `active: true` so a second jump later still appears under default “Active only.”
- Reuse `POST /api/athletes`. Allow null `graduating_class` for current athletes. Manage Athletes can still require class year on its own form.
- Same `EntryForm` on `/data-entry` and session edit; both get the feature.

## 2. Success criteria

- Staff type a new name, tap Add, fill M/F (and optional grade or alumni), Create, then enter a jump without opening Manage Athletes.
- Existing roster search, Clear, Active only, and jump save still work.
- Boys/Girls and Split alumni leaderboard buckets are correct for the new row.
- Duplicate full names are allowed. Abandoned creates do not happen unless staff tap Create (create is immediate, but only on that button / panel Enter).

## 3. Out of scope

No BTSN toggle, guest type, create-on-jump transaction, schema migration, unique-name constraint, auto-select Vertical Jump, or Manage Athletes form changes.
