# Split Alumni Leaderboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Split alumni" checkbox so alumni marks appear in separate leaderboard section(s) with per-section rank (#1, #2, #3…). When both "Group by gender" and "Split alumni" are on, show four sections: Athletes (Boys), Athletes (Girls), Alumni (Boys), Alumni (Girls).

**Architecture:** Client-side only; no API changes. A shared `getLeaderboardSections()` in `src/lib/leaderboard-sections.ts` returns an array of `{ title, rows }` from `rows` / `male` / `female` and the two toggles. Live leaderboard, Historical cards, and Historical bar chart all use this util and render one block per section (empty sections omitted). Section title "" means "single list" (no heading, no per-section display rank).

**Tech Stack:** Next.js 16, React 19, Vitest, TypeScript. Reference design: `docs/plans/2026-03-09-split-alumni-leaderboard-design.md`.

---

### Task 1: getLeaderboardSections utility (TDD)

**Files:**
- Create: `src/lib/leaderboard-sections.ts`
- Create: `src/lib/leaderboard-sections.test.ts`
- Reference: `src/types/index.ts` (LeaderboardRow)

**Step 1: Write the failing test**

Create `src/lib/leaderboard-sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getLeaderboardSections } from "./leaderboard-sections";
import type { LeaderboardRow } from "@/types";

function row(id: string, athlete_type: LeaderboardRow["athlete_type"] = "athlete", gender = "M"): LeaderboardRow {
  return {
    rank: 1,
    athlete_id: id,
    first_name: "A",
    last_name: "B",
    gender,
    display_value: 10,
    units: "m",
    athlete_type,
  };
}

describe("getLeaderboardSections", () => {
  it("returns single section with empty title when neither toggle is on", () => {
    const rows: LeaderboardRow[] = [row("1"), row("2")];
    const result = getLeaderboardSections({
      rows,
      groupByGender: false,
      splitByAlumni: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("");
    expect(result[0].rows).toEqual(rows);
  });

  it("returns Athletes and Alumni sections when only splitByAlumni is on", () => {
    const a1 = row("1", "athlete");
    const a2 = row("2", "staff");
    const al = row("3", "alumni");
    const rows = [a1, a2, al];
    const result = getLeaderboardSections({
      rows,
      groupByGender: false,
      splitByAlumni: true,
    });
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Athletes");
    expect(result[0].rows).toEqual([a1, a2]);
    expect(result[1].title).toBe("Alumni");
    expect(result[1].rows).toEqual([al]);
  });

  it("treats missing athlete_type as athlete", () => {
    const r = row("1"); (r as { athlete_type?: string }).athlete_type = undefined;
    const result = getLeaderboardSections({
      rows: [r],
      groupByGender: false,
      splitByAlumni: true,
    });
    expect(result[0].title).toBe("Athletes");
    expect(result[0].rows).toHaveLength(1);
  });

  it("returns Boys and Girls when only groupByGender is on", () => {
    const male = [row("1", "athlete", "M")];
    const female = [row("2", "athlete", "F")];
    const result = getLeaderboardSections({
      rows: [...male, ...female],
      male,
      female,
      groupByGender: true,
      splitByAlumni: false,
    });
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Boys");
    expect(result[0].rows).toEqual(male);
    expect(result[1].title).toBe("Girls");
    expect(result[1].rows).toEqual(female);
  });

  it("returns four sections when both toggles are on", () => {
    const maleAthletes = [row("1", "athlete", "M")];
    const femaleAthletes = [row("2", "athlete", "F")];
    const maleAlumni = [row("3", "alumni", "M")];
    const femaleAlumni = [row("4", "alumni", "F")];
    const male = [...maleAthletes, ...maleAlumni];
    const female = [...femaleAthletes, ...femaleAlumni];
    const result = getLeaderboardSections({
      rows: [...male, ...female],
      male,
      female,
      groupByGender: true,
      splitByAlumni: true,
    });
    expect(result).toHaveLength(4);
    expect(result[0].title).toBe("Athletes (Boys)");
    expect(result[0].rows).toEqual(maleAthletes);
    expect(result[1].title).toBe("Athletes (Girls)");
    expect(result[1].rows).toEqual(femaleAthletes);
    expect(result[2].title).toBe("Alumni (Boys)");
    expect(result[2].rows).toEqual(maleAlumni);
    expect(result[3].title).toBe("Alumni (Girls)");
    expect(result[3].rows).toEqual(femaleAlumni);
  });

  it("omits empty sections", () => {
    const athletes = [row("1", "athlete")];
    const result = getLeaderboardSections({
      rows: athletes,
      groupByGender: false,
      splitByAlumni: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Athletes");
    expect(result[0].rows).toEqual(athletes);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/leaderboard-sections.test.ts -v`  
Expected: FAIL (getLeaderboardSections not found or module not found).

**Step 3: Write minimal implementation**

Create `src/lib/leaderboard-sections.ts`:

```ts
import type { LeaderboardRow } from "@/types";

export type LeaderboardSection = { title: string; rows: LeaderboardRow[] };

function isAlumni(r: LeaderboardRow): boolean {
  return (r.athlete_type ?? "athlete") === "alumni";
}

export function getLeaderboardSections(options: {
  rows: LeaderboardRow[];
  male?: LeaderboardRow[];
  female?: LeaderboardRow[];
  groupByGender: boolean;
  splitByAlumni: boolean;
}): LeaderboardSection[] {
  const { rows, male = [], female = [], groupByGender, splitByAlumni } = options;

  if (groupByGender && (male.length > 0 || female.length > 0)) {
    if (splitByAlumni) {
      const maleAthletes = male.filter((r) => !isAlumni(r));
      const femaleAthletes = female.filter((r) => !isAlumni(r));
      const maleAlumni = male.filter(isAlumni);
      const femaleAlumni = female.filter(isAlumni);
      const sections: LeaderboardSection[] = [
        { title: "Athletes (Boys)", rows: maleAthletes },
        { title: "Athletes (Girls)", rows: femaleAthletes },
        { title: "Alumni (Boys)", rows: maleAlumni },
        { title: "Alumni (Girls)", rows: femaleAlumni },
      ].filter((s) => s.rows.length > 0);
      return sections.length > 0 ? sections : [{ title: "", rows }];
    }
    const sections: LeaderboardSection[] = [
      { title: "Boys", rows: male },
      { title: "Girls", rows: female },
    ].filter((s) => s.rows.length > 0);
    return sections.length > 0 ? sections : [{ title: "", rows }];
  }

  if (splitByAlumni) {
    const athletes = rows.filter((r) => !isAlumni(r));
    const alumni = rows.filter(isAlumni);
    const sections: LeaderboardSection[] = [
      { title: "Athletes", rows: athletes },
      { title: "Alumni", rows: alumni },
    ].filter((s) => s.rows.length > 0);
    return sections.length > 0 ? sections : [{ title: "", rows }];
  }

  return [{ title: "", rows }];
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/leaderboard-sections.test.ts -v`  
Expected: PASS (all tests green).

**Step 5: Commit**

```bash
git add src/lib/leaderboard-sections.ts src/lib/leaderboard-sections.test.ts
git commit -m "feat(leaderboard): add getLeaderboardSections for split alumni"
```

---

### Task 2: LeaderboardClient — state and checkbox

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (state ~line 65, checkbox ~line 162, pass prop ~line 232)

**Step 1: Add splitByAlumni state**

In `LeaderboardClient`, next to `const [groupByGender, setGroupByGender] = useState(false);` add:

```ts
const [splitByAlumni, setSplitByAlumni] = useState(false);
```

**Step 2: Add checkbox after "Group by gender"**

After the existing "Group by gender" label (the closing `</label>` around line 163), add:

```tsx
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={splitByAlumni}
    onChange={(e) => startTransition(() => setSplitByAlumni(e.target.checked))}
    className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
  />
  <span className="text-sm text-foreground-muted">Split alumni</span>
</label>
```

**Step 3: Pass splitByAlumni to ComponentLeaderboard**

In the `ComponentLeaderboard` usage, add the prop: `splitByAlumni={splitByAlumni}`. Update the `ComponentLeaderboard` function signature to accept `splitByAlumni: boolean` in its props type and destructuring.

**Step 4: Manual check**

Run `npm run dev`, open Leaderboard, select a session; confirm the new "Split alumni" checkbox appears and toggles without error (leaderboard content does not need to change yet).

**Step 5: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): add Split alumni state and checkbox, pass to ComponentLeaderboard"
```

---

### Task 3: ComponentLeaderboard — use getLeaderboardSections and render sections

**Files:**
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (ComponentLeaderboard: import, props, section derivation, render branch)

**Step 1: Import and use getLeaderboardSections**

At top of file add: `import { getLeaderboardSections } from "@/lib/leaderboard-sections";`

**Step 2: Add splitByAlumni to ComponentLeaderboard props**

Extend the props type and destructuring to include `splitByAlumni: boolean`. Include `splitByAlumni` in the component’s dependency list where relevant (e.g. effect that computes triggers still uses `data?.data` rows/male/female; no change to URL or effect deps).

**Step 3: Derive sections from data and toggles**

Inside ComponentLeaderboard, after `const showGrouped = ...`, compute:

```ts
const sections = getLeaderboardSections({
  rows,
  male,
  female,
  groupByGender,
  splitByAlumni,
});
```

Keep existing `showGrouped` for the animation/trigger logic (triggers still based on male/female or rows). Use `sections` only for rendering.

**Step 4: Replace render branch with section-based render**

Replace the conditional that currently does `showGrouped ? (male section, female section) : (single list)` with:

- If `sections.length === 1 && sections[0].title === ""`: render the single list as today (one grid of `LeaderboardCard`, no `displayRank`).
- Else: for each section, render a wrapper with `<p className="mb-2 text-xs font-medium text-foreground-muted">{section.title}</p>` and the same grid of `LeaderboardCard`s, passing `displayRank={i + 1}` for each card.

Preserve existing error/loading/empty handling and animation trigger map (triggerMap.get(r.athlete_id)). Use the same motion.div and grid classes as the current Boys/Girls blocks.

**Step 5: Manual check**

With a session that has both athletes and alumni, turn on "Split alumni"; confirm two sections "Athletes" and "Alumni" with per-section ranks. Turn on "Group by gender" as well; confirm four sections with correct titles and ranks.

**Step 6: Commit**

```bash
git add src/app/leaderboard/LeaderboardClient.tsx
git commit -m "feat(leaderboard): render sections via getLeaderboardSections and split alumni UI"
```

---

### Task 4: HistoricalClient — state, checkbox, and cards view sections

**Files:**
- Modify: `src/app/historical/HistoricalClient.tsx` (state ~line 80, checkbox ~line 256, cards render ~323–380)

**Step 1: Add splitByAlumni state**

Next to `const [groupByGender, setGroupByGender] = useState(false);` add:

```ts
const [splitByAlumni, setSplitByAlumni] = useState(false);
```

**Step 2: Add checkbox**

After the "Group by gender" label, add a "Split alumni" checkbox with the same pattern (checked, onChange with startTransition, same class names and label text).

**Step 3: Import getLeaderboardSections**

Add: `import { getLeaderboardSections } from "@/lib/leaderboard-sections";`

**Step 4: Derive sections for cards view**

Where the cards view uses `showGrouped`, `male`, `female`, and `rows`, compute:

```ts
const sections = getLeaderboardSections({
  rows,
  male,
  female,
  groupByGender,
  splitByAlumni,
});
```

**Step 5: Render cards by section**

Replace the cards branch that currently does `showGrouped ? (Boys block, Girls block) : (single list)` with the same pattern as ComponentLeaderboard: if one section with empty title, render single list of cards without displayRank; else map over sections, render section title then grid of cards with `displayRank={i + 1}` and the same `rankClass(displayRank)` styling. Reuse the existing card div structure and `formatValue`/`formatLeaderboardName` usage.

**Step 6: Pass splitByAlumni to HistoricalLeaderboardBar**

Where `HistoricalLeaderboardBar` is rendered, add prop `splitByAlumni={splitByAlumni}` (Task 5 will consume it).

**Step 7: Manual check**

Historical page, cards view: toggle "Split alumni" and "Group by gender" in all combinations; confirm section titles and per-section ranks.

**Step 8: Commit**

```bash
git add src/app/historical/HistoricalClient.tsx
git commit -m "feat(historical): add Split alumni state, checkbox, and section-based cards"
```

---

### Task 5: HistoricalLeaderboardBar — splitByAlumni prop and 2 or 4 charts

**Files:**
- Modify: `src/app/historical/HistoricalLeaderboardBar.tsx` (Props type, getLeaderboardSections import, branch for 2/4 sections)

**Step 1: Add splitByAlumni to Props and import util**

Add `splitByAlumni?: boolean` to the component’s Props type (default `false`). Add: `import { getLeaderboardSections } from "@/lib/leaderboard-sections";`

**Step 2: Compute sections when splitByAlumni or groupByGender**

At the start of the component body, compute:

```ts
const sections = getLeaderboardSections({
  rows,
  male,
  female,
  groupByGender,
  splitByAlumni: splitByAlumni ?? false,
});
```

**Step 3: Branch: single list vs multiple sections**

- If `sections.length === 1 && sections[0].title === ""`: keep the current single-chart branch (the existing code that uses `rows` and one BarChart with Legend, etc.). No change to that block.
- If `sections.length >= 1 && (sections[0].title !== "" || sections.length > 1)`: render one bar chart per section. Reuse the same chart structure as the existing "Boys"/"Girls" branch: for each section, a wrapper div, `<p className="mb-2 text-xs font-medium text-foreground-muted">{section.title}</p>`, then ResponsiveContainer and BarChart with data built from `section.rows.map((r, i) => ({ name: formatLeaderboardName(...), fullName: ..., value: r.display_value, rank: i + 1, ... }))`. Use the same tooltip formatter and (for the 2-chart case) reuse the same bar color logic or a single color; for 4 sections you may use MALE_COLOR for Boys and FEMALE_COLOR for Girls in the title. Team average reference lines: keep current behavior (maleAvg/femaleAvg only); do not add per-section averages. Omit rendering a chart for a section that has no rows (sections are already filtered by the util).

**Step 4: Manual check**

Historical page, Bar chart view: "Split alumni" on only → two charts "Athletes" and "Alumni"; both on → four charts with correct titles; tooltips show per-section rank (#1, #2, …).

**Step 5: Commit**

```bash
git add src/app/historical/HistoricalLeaderboardBar.tsx
git commit -m "feat(historical): bar chart supports split alumni with 2 or 4 sections"
```

---

### Task 6: Final verification and docs

**Files:**
- None (manual + optional README note)

**Step 1: Run tests**

Run: `npm test -- -v`  
Expected: All tests pass, including `leaderboard-sections.test.ts` and existing tests.

**Step 2: Manual regression**

- Leaderboard: no session selected → message; select session → metrics load; expand metric, one component → single list; "Group by gender" on → Boys/Girls; "Split alumni" on → Athletes/Alumni; both on → four sections. Confirm ranks and gold/silver/bronze per section.
- Historical: Cards and Bar; same toggle matrix. Confirm no console errors and correct section titles.

**Step 3: Commit (if any tweaks)**

If you made small fixes, commit with a message like `chore(leaderboard): verification and lint for split alumni`.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-03-09-split-alumni-leaderboard-implementation.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Parallel Session (separate)** — Open a new session with @executing-plans in the same repo (or worktree), batch execution with checkpoints.

Which approach do you want?
