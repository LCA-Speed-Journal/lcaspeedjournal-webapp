# Boys Basketball Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a testing battery that ranks a three-day boys basketball baseline live, with bib entry, DRI bands, a Friday lane sheet, and September 2 soccer deltas on the shared tests.

**Architecture:** Pure functions in `src/lib/battery/` own points, DRI, repeat-sprint math, bibs, lanes, and soccer deltas. They never call the database. A loader reads sessions and entries, then `scoreBattery` assembles the today board and the meet board. The public gym page polls that payload. Coach routes create the battery, issue bibs, close a day, and freeze lanes. Existing `pointsForPlace` and `scoreTestingDayMatrix` stay untouched.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates), existing sprint helpers in `src/lib/norms/testing-day-derived.ts` and `src/lib/norms/testing-day-rank.ts`.

**Product source:** `docs/plans/2026-11-04-basketball-baseline-design.md`.

---

## Rules the implementer must not break

- Do not change `PLACE_POINTS`, `pointsForPlace`, or `scoreTestingDayMatrix`. Other sports still use the top-8 report.
- Do not recompute DRI from jump height and contact time. Store the mat's number.
- Do not rank a raw DRI number against a raw RSI number. DRI points come only from other DRI marks.
- Sprint columns still come from `pickBestTwentyYdHits` and `pickBestMaxVelocityHits`. The meet total averages those three point values through `scoreAthleteTotals`.
- 10×10 best, mean, and decrement each keep their own points. Do not average them.
- Bibs and the Friday lane sheet freeze on print. A late add does not renumber people or reshuffle heats.
- Do not run `scripts/migrate-testing-battery.sql` against a database in this plan. Ross runs that.
- Tests are `npx vitest run <file>`. The repo script is `npm test` (Vitest).

---

### Task 1: Full-field points

**Files:**
- Create: `src/lib/battery/rank.ts`
- Test: `src/lib/battery/rank.test.ts`

**Step 1: Write the failing test**

Create `src/lib/battery/rank.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rankFullField } from "./rank";

describe("rankFullField", () => {
  it("gives first place one point per athlete in the field", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "a", value: 5 },
        { athlete_id: "b", value: 4 },
        { athlete_id: "c", value: 3 },
      ],
      "higher"
    );
    const first = ranked.find((row) => row.athlete_id === "a");
    expect(first).toMatchObject({ rank: 1, tied: false, points: 3 });
  });

  it("shares points on a tie and skips the next place", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "a", value: 10 },
        { athlete_id: "b", value: 10 },
        { athlete_id: "c", value: 8 },
      ],
      "higher"
    );
    expect(ranked.find((row) => row.athlete_id === "a")).toMatchObject({
      rank: 1,
      tied: true,
      points: 2,
    });
    expect(ranked.find((row) => row.athlete_id === "b")).toMatchObject({
      rank: 1,
      tied: true,
      points: 2,
    });
    expect(ranked.find((row) => row.athlete_id === "c")).toMatchObject({
      rank: 3,
      tied: false,
      points: 1,
    });
  });

  it("treats a lower time as better", () => {
    const ranked = rankFullField(
      [
        { athlete_id: "slow", value: 5.2 },
        { athlete_id: "fast", value: 4.8 },
      ],
      "lower"
    );
    expect(ranked.find((row) => row.athlete_id === "fast")?.rank).toBe(1);
    expect(ranked.find((row) => row.athlete_id === "slow")?.points).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/rank.test.ts`

Expected: FAIL with `rankFullField` not defined.

**Step 3: Write minimal implementation**

Create `src/lib/battery/rank.ts`:

```ts
export type RankDirection = "higher" | "lower";

export type FieldMark = {
  athlete_id: string;
  value: number;
};

export type FieldRank = FieldMark & {
  rank: number;
  tied: boolean;
  points: number;
};

export function rankFullField(
  marks: FieldMark[],
  direction: RankDirection
): FieldRank[] {
  const sorted = marks.toSorted((a, b) => {
    if (a.value !== b.value) {
      return direction === "lower" ? a.value - b.value : b.value - a.value;
    }
    return a.athlete_id.localeCompare(b.athlete_id);
  });
  const out: FieldRank[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const rank = i + 1;
    const tied = j - i > 1;
    const points = marks.length - j + 1;
    for (let k = i; k < j; k += 1) {
      out.push({ ...sorted[k], rank, tied, points });
    }
    i = j;
  }
  return out;
}
```

Points are athletes with a strictly worse mark, plus 1. Two athletes tied for first in a field of three each beat one person, so each gets 2. The next athlete is 3rd and gets 1.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/rank.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/rank.ts src/lib/battery/rank.test.ts
git commit -m "feat: rank a full testing field by athletes beaten"
```

---

### Task 2: Counted slots and the sprint average

**Files:**
- Create: `src/lib/battery/slots.ts`
- Test: `src/lib/battery/slots.test.ts`

The nine slots are the meet total. Sprint points are averaged by the existing `scoreAthleteTotals`. Call it. Do not copy the average.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { batteryTotal, COUNTED_SLOT_COUNT } from "./slots";

describe("batteryTotal", () => {
  it("averages the three sprint columns into one slot", () => {
    const total = batteryTotal({
      "10-5_RSI": 30,
      "20yd_Dash": 20,
      "40yd_Dash": 10,
      MaxVelocity: 30,
      DRI: 15,
    });
    expect(COUNTED_SLOT_COUNT).toBe(9);
    expect(total.sprint_points).toBe(20);
    expect(total.total_points).toBe(65);
    expect(total.slots_completed).toBe(3);
  });

  it("leaves a missing sprint column out of the average", () => {
    const total = batteryTotal({
      "40yd_Dash": 10,
      "Vertical Jump": 8,
    });
    expect(total.sprint_points).toBe(10);
    expect(total.total_points).toBe(18);
    expect(total.slots_completed).toBe(2);
  });

  it("counts each 10x10 quality as its own slot", () => {
    const total = batteryTotal({
      "10x10m_best": 4,
      "10x10m_mean": 5,
      "10x10m_decrement": 6,
    });
    expect(total.total_points).toBe(15);
    expect(total.slots_completed).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/slots.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

`src/lib/battery/slots.ts`:

```ts
import { scoreAthleteTotals } from "@/lib/norms/testing-day-rank";

export const COUNTED_SLOT_COUNT = 9;

const SPRINT_KEYS = ["20yd_Dash", "40yd_Dash", "MaxVelocity"] as const;

const OTHER_SLOTS = [
  "10-5_RSI",
  "DRI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
] as const;

export function batteryTotal(pointsByKey: Record<string, number>): {
  sprint_points: number;
  total_points: number;
  slots_completed: number;
} {
  const totals = scoreAthleteTotals(pointsByKey);
  const sprintPresent = SPRINT_KEYS.some((key) => pointsByKey[key] != null);
  const otherPresent = OTHER_SLOTS.filter((key) => pointsByKey[key] != null).length;
  return {
    sprint_points: totals.sprint_points,
    total_points: totals.total_points,
    slots_completed: otherPresent + (sprintPresent ? 1 : 0),
  };
}
```

`scoreAthleteTotals` already ignores unknown keys and averages only the sprint family. The three `10x10m_*` keys are not in that family, so they add.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/slots.test.ts src/lib/norms/testing-day-rank.test.ts`

Expected: PASS, including the existing testing-day rank tests.

**Step 5: Commit**

```bash
git add src/lib/battery/slots.ts src/lib/battery/slots.test.ts
git commit -m "feat: count basketball meet slots with the soccer sprint average"
```

---

### Task 3: DRI bands, team box, and the higher-box flag

**Files:**
- Create: `src/lib/battery/dri.ts`
- Test: `src/lib/battery/dri.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { driBand, higherBoxFlag, pickTeamDriBox } from "./dri";

describe("driBand", () => {
  it("puts boundary marks in the higher band, and 3.0 stays Bouncy", () => {
    expect(driBand(0.49).label).toBe("Warming Up");
    expect(driBand(0.5).label).toBe("Rebound Ready");
    expect(driBand(1.24).label).toBe("Rebound Ready");
    expect(driBand(1.25).label).toBe("Pretty Springy");
    expect(driBand(2).label).toBe("Bouncy");
    expect(driBand(3).label).toBe("Bouncy");
    expect(driBand(3.01).label).toBe("Elite");
  });
});

describe("pickTeamDriBox", () => {
  it("picks the box with the highest median", () => {
    const box = pickTeamDriBox([
      { box: "6", value: 0.4 },
      { box: "12", value: 1.8 },
      { box: "12", value: 2.2 },
      { box: "18", value: 1.2 },
      { box: "18", value: 1.4 },
    ]);
    expect(box).toBe("12");
  });

  it("uses the lower box when medians tie", () => {
    const box = pickTeamDriBox([
      { box: "12", value: 2 },
      { box: "18", value: 2 },
    ]);
    expect(box).toBe("12");
  });
});

describe("higherBoxFlag", () => {
  it("flags a personal peak above the team box", () => {
    expect(higherBoxFlag("18", "12")).toBe(true);
    expect(higherBoxFlag("24", "12")).toBe(true);
    expect(higherBoxFlag("12", "12")).toBe(false);
    expect(higherBoxFlag("6", "12")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/dri.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

`src/lib/battery/dri.ts`:

```ts
export const DRI_BOXES = ["6", "12", "18", "24"] as const;
export type DriBox = (typeof DRI_BOXES)[number];

export type DriBand = { key: string; label: string };

export function driBand(value: number): DriBand {
  if (value < 0.5) return { key: "warming_up", label: "Warming Up" };
  if (value < 1.25) return { key: "rebound_ready", label: "Rebound Ready" };
  if (value < 2) return { key: "pretty_springy", label: "Pretty Springy" };
  if (value <= 3) return { key: "bouncy", label: "Bouncy" };
  return { key: "elite", label: "Elite" };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function pickTeamDriBox(
  marks: { box: string; value: number }[]
): DriBox | null {
  let best: { box: DriBox; median: number } | null = null;
  for (const box of DRI_BOXES) {
    const med = median(marks.filter((mark) => mark.box === box).map((mark) => mark.value));
    if (med == null) continue;
    if (
      !best ||
      med > best.median ||
      (med === best.median && Number(box) < Number(best.box))
    ) {
      best = { box, median: med };
    }
  }
  return best?.box ?? null;
}

export function higherBoxFlag(
  peakBox: string | null,
  teamBox: string | null
): boolean {
  if (peakBox == null || teamBox == null) return false;
  return Number(peakBox) > Number(teamBox);
}

export function peakBox(
  marks: { box: string; value: number }[]
): string | null {
  let best: { box: string; value: number } | null = null;
  for (const mark of marks) {
    if (!best || mark.value > best.value) best = mark;
  }
  return best?.box ?? null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/dri.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/dri.ts src/lib/battery/dri.test.ts
git commit -m "feat: band DRI marks and pick the team box"
```

---

### Task 4: 10×10 scores

**Files:**
- Create: `src/lib/battery/repeat-sprint.ts`
- Test: `src/lib/battery/repeat-sprint.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { scoreRepeatSprint } from "./repeat-sprint";

describe("scoreRepeatSprint", () => {
  it("scores a full set of ten", () => {
    const times = [1.7, ...Array(9).fill(1.9)];
    const scored = scoreRepeatSprint(times);
    expect(scored).not.toBeNull();
    expect(scored!.best).toBeCloseTo(1.7);
    expect(scored!.mean).toBeCloseTo(1.88);
    expect(scored!.decrement).toBeCloseTo(10.588, 2);
  });

  it("returns null until all ten reps exist", () => {
    expect(scoreRepeatSprint([1.7, 1.8])).toBeNull();
  });

  it("scores ten identical reps as zero decrement", () => {
    const scored = scoreRepeatSprint(Array(10).fill(1.8));
    expect(scored!.decrement).toBeCloseTo(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/repeat-sprint.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export type RepeatSprintScore = {
  best: number;
  mean: number;
  decrement: number;
};

export function scoreRepeatSprint(times: number[]): RepeatSprintScore | null {
  if (times.length !== 10) return null;
  if (times.some((time) => !Number.isFinite(time) || time <= 0)) return null;
  const best = Math.min(...times);
  const sum = times.reduce((total, time) => total + time, 0);
  return {
    best,
    mean: sum / 10,
    decrement: (sum / (best * 10) - 1) * 100,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/repeat-sprint.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/repeat-sprint.ts src/lib/battery/repeat-sprint.test.ts
git commit -m "feat: score a 10x10 set as best, mean, and decrement"
```

---

### Task 5: Repeat-rep parser and DRI entry rows

**Files:**
- Modify: `src/lib/parser.ts` (the `input_structure` union and `parseEntry`)
- Modify: `src/lib/metrics.json` (add `DRI` and `10x10m` after `10-5_RSI`)
- Test: `src/lib/battery/parse-station.test.ts`

DRI is four single numbers, one per box. The 10×10 is ten independent times. Do not send either through `cumulative`. Cumulative sums splits.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseEntry } from "@/lib/parser";

describe("battery station parsing", () => {
  it("stores four DRI marks on their box components", () => {
    const rows = parseEntry("DRI", "0.8, 1.9, 2.4, 1.6");
    expect(rows.map((row) => [row.component, row.display_value])).toEqual([
      ["6", 0.8],
      ["12", 1.9],
      ["18", 2.4],
      ["24", 1.6],
    ]);
  });

  it("stores ten 10x10 reps as interval rows", () => {
    const raw = "1.80, 1.82, 1.85, 1.84, 1.90, 1.88, 1.91, 1.93, 1.95, 1.97";
    const rows = parseEntry("10x10m", raw);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ interval_index: 1, units: "s", display_value: 1.8 });
    expect(rows[9].interval_index).toBe(10);
    expect(rows.every((row) => row.component == null)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/parse-station.test.ts`

Expected: FAIL because the metric keys are missing or the structure is unknown.

**Step 3: Write minimal implementation**

Add to `src/lib/metrics.json` immediately after the `10-5_RSI` object:

```json
"DRI": {
  "display_name": "DRI",
  "category": "X-Factor",
  "subcategory": "Vertical Jump",
  "input_units": "DRI",
  "display_units": "DRI",
  "conversion_formula": "",
  "input_structure": "dri_boxes",
  "default_splits": ["6", "12", "18", "24"]
},
"10x10m": {
  "display_name": "10x10m",
  "category": "Lactic",
  "subcategory": "Sprints",
  "input_units": "s",
  "display_units": "s",
  "conversion_formula": "",
  "input_structure": "repeat_reps",
  "default_splits": [10]
},
```

In `src/lib/parser.ts`, extend `input_structure` with `"dri_boxes" | "repeat_reps"`. In `parseEntry`, before the unknown-structure throw:

```ts
if (inputStructure === "dri_boxes") {
  const labels = (metric.default_splits as string[]).filter((s) => typeof s === "string");
  const parts = splitValues(rawInput);
  if (parts.length !== labels.length) {
    throw new Error(`DRI values (${parts.length}) do not match boxes (${labels.length})`);
  }
  return labels.map((label, i) => {
    const value = parseFloat(parts[i]);
    if (!Number.isFinite(value)) throw new Error(`Cannot parse DRI "${parts[i]}"`);
    return {
      metric_key: metricKey,
      interval_index: null,
      component: label,
      value,
      display_value: value,
      units: metric.display_units,
    };
  });
}

if (inputStructure === "repeat_reps") {
  const expected = Number(metric.default_splits[0] ?? 10);
  const parts = splitValues(rawInput);
  if (parts.length !== expected) {
    throw new Error(`Repeat reps (${parts.length}) do not match ${expected}`);
  }
  return parts.map((part, i) => {
    const value = parseFloat(part);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Cannot parse rep "${part}"`);
    }
    return {
      metric_key: metricKey,
      interval_index: i + 1,
      component: null,
      value,
      display_value: value,
      units: "s",
    };
  });
}
```

`parseEntry` already takes `(metricKey, rawInput)`. Match that signature. If the function also takes session overrides, pass them through and ignore them for these two structures.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/parse-station.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/metrics.json src/lib/parser.ts src/lib/battery/parse-station.test.ts
git commit -m "feat: parse DRI boxes and 10x10 reps as separate marks"
```

---

### Task 6: Bib numbers

**Files:**
- Create: `src/lib/battery/bibs.ts`
- Test: `src/lib/battery/bibs.test.ts`

Senior graduation year for this season is 2027. Grade digit = `(12 - (graduating_class - 2027)) - 8`. Class of 2030 is 1. Class of 2027 is 4. Anything outside 1–4 is unnumbered.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assignBibs, gradeDigit } from "./bibs";

const senior = 2027;

describe("gradeDigit", () => {
  it("maps the 2026-27 classes", () => {
    expect(gradeDigit(2030, senior)).toBe(1);
    expect(gradeDigit(2029, senior)).toBe(2);
    expect(gradeDigit(2028, senior)).toBe(3);
    expect(gradeDigit(2027, senior)).toBe(4);
    expect(gradeDigit(2031, senior)).toBeNull();
    expect(gradeDigit(null, senior)).toBeNull();
  });
});

describe("assignBibs", () => {
  it("numbers alphabetical order inside the grade", () => {
    const bibs = assignBibs(
      [
        { athlete_id: "b", first_name: "Bea", last_name: "Young", graduating_class: 2029 },
        { athlete_id: "a", first_name: "Ann", last_name: "Adams", graduating_class: 2029 },
        { athlete_id: "c", first_name: "Cam", last_name: "Cole", graduating_class: 2030 },
      ],
      senior,
      []
    );
    expect(bibs.map((row) => [row.athlete_id, row.bib])).toEqual([
      ["c", "101"],
      ["a", "201"],
      ["b", "202"],
    ]);
  });

  it("appends a late add without renumbering issued bibs", () => {
    const bibs = assignBibs(
      [
        { athlete_id: "a", first_name: "Ann", last_name: "Adams", graduating_class: 2029 },
        { athlete_id: "z", first_name: "Zoe", last_name: "Zed", graduating_class: 2029 },
      ],
      senior,
      [{ athlete_id: "a", bib: "201" }]
    );
    expect(bibs.find((row) => row.athlete_id === "a")?.bib).toBe("201");
    expect(bibs.find((row) => row.athlete_id === "z")?.bib).toBe("202");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/bibs.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export type BibAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  graduating_class: number | null;
};

export type IssuedBib = { athlete_id: string; bib: string };

export type AssignedBib = {
  athlete_id: string;
  bib: string;
  grade_digit: number;
  alpha_index: number;
};

export function gradeDigit(
  graduatingClass: number | null,
  seniorGradYear: number
): number | null {
  if (graduatingClass == null) return null;
  const digit = 12 - (graduatingClass - seniorGradYear) - 8;
  if (digit < 1 || digit > 4) return null;
  return digit;
}

function byName(a: BibAthlete, b: BibAthlete): number {
  return (
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name) ||
    a.athlete_id.localeCompare(b.athlete_id)
  );
}

export function assignBibs(
  athletes: BibAthlete[],
  seniorGradYear: number,
  issued: IssuedBib[]
): AssignedBib[] {
  const issuedById = new Map(issued.map((row) => [row.athlete_id, row.bib]));
  const out: AssignedBib[] = [];
  for (const digit of [1, 2, 3, 4]) {
    const group = athletes
      .filter((athlete) => gradeDigit(athlete.graduating_class, seniorGradYear) === digit)
      .toSorted(byName);
    const taken = new Set<number>();
    for (const athlete of group) {
      const existing = issuedById.get(athlete.athlete_id);
      if (!existing || !existing.startsWith(String(digit))) continue;
      taken.add(Number(existing.slice(1)));
    }
    let next = 1;
    for (const athlete of group) {
      const existing = issuedById.get(athlete.athlete_id);
      if (existing) {
        out.push({
          athlete_id: athlete.athlete_id,
          bib: existing,
          grade_digit: digit,
          alpha_index: Number(existing.slice(1)),
        });
        continue;
      }
      while (taken.has(next)) next += 1;
      const alpha = next;
      taken.add(alpha);
      next += 1;
      out.push({
        athlete_id: athlete.athlete_id,
        bib: `${digit}${String(alpha).padStart(2, "0")}`,
        grade_digit: digit,
        alpha_index: alpha,
      });
    }
  }
  return out;
}
```

When `issued` is empty, sophomores sort Adams then Young and become 201 and 202. After 201 is issued, Zed gets 202 even though Adams would sort first again.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/bibs.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/bibs.ts src/lib/battery/bibs.test.ts
git commit -m "feat: assign frozen grade-and-alpha bibs"
```

---

### Task 7: Friday lane pairs

**Files:**
- Create: `src/lib/battery/lanes.ts`
- Test: `src/lib/battery/lanes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { seedLanes } from "./lanes";

describe("seedLanes", () => {
  it("pairs 1 with 2 and runs that heat last", () => {
    const heats = seedLanes(["a", "b", "c", "d"]);
    expect(heats.map((heat) => heat.athlete_ids)).toEqual([
      ["c", "d"],
      ["a", "b"],
    ]);
    expect(heats[1].is_final).toBe(true);
  });

  it("opens with a solo when the field is odd", () => {
    const heats = seedLanes(["a", "b", "c"]);
    expect(heats[0].athlete_ids).toEqual(["c"]);
    expect(heats[heats.length - 1].athlete_ids).toEqual(["a", "b"]);
  });
});
```

`seedLanes` takes athlete ids already sorted by meet place, index 0 = 1st.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/lanes.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export type LaneHeat = {
  heat: number;
  athlete_ids: string[];
  is_final: boolean;
};

export function seedLanes(placeOrder: string[]): LaneHeat[] {
  const pairs: string[][] = [];
  for (let i = 0; i < placeOrder.length; i += 2) {
    pairs.push(placeOrder.slice(i, i + 2));
  }
  const heats = pairs.toReversed();
  return heats.map((athlete_ids, index) => ({
    heat: index + 1,
    athlete_ids,
    is_final: index === heats.length - 1,
  }));
}
```

`toReversed` keeps the input order intact. Heat 1 is the bottom pair. The last heat is 1st and 2nd.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/lanes.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/lanes.ts src/lib/battery/lanes.test.ts
git commit -m "feat: seed two-lane heats from the meet order"
```

---

### Task 8: Soccer deltas

**Files:**
- Create: `src/lib/battery/compare.ts`
- Test: `src/lib/battery/compare.test.ts`

Shared keys: `Standing-Broad`, `20yd_Dash`, `40yd_Dash`, `MaxVelocity`, `OH-MB_Throw`. Time keys improve when the new number is smaller. Distance and mph improve when the new number is larger.

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { compareMark, SHARED_SOCCER_KEYS } from "./compare";

describe("compareMark", () => {
  it("calls a faster 40 an improvement", () => {
    const delta = compareMark("40yd_Dash", 4.9, 5.1);
    expect(delta).toMatchObject({ improved: true, change: -0.2 });
  });

  it("calls a farther broad jump an improvement", () => {
    const delta = compareMark("Standing-Broad", 8.2, 7.6);
    expect(delta).toMatchObject({ improved: true, change: 0.6 });
  });

  it("returns null when soccer has no mark", () => {
    expect(compareMark("Standing-Broad", 8, null)).toBeNull();
  });

  it("does not compare RSI", () => {
    expect(SHARED_SOCCER_KEYS.has("10-5_RSI")).toBe(false);
    expect(SHARED_SOCCER_KEYS.has("DRI")).toBe(false);
    expect(SHARED_SOCCER_KEYS.has("10x10m_best")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/compare.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export const SHARED_SOCCER_KEYS = new Set([
  "Standing-Broad",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "OH-MB_Throw",
]);

const LOWER_BETTER = new Set(["20yd_Dash", "40yd_Dash"]);

export type MarkDelta = {
  previous: number;
  current: number;
  change: number;
  improved: boolean;
};

export function compareMark(
  metricKey: string,
  current: number | null,
  previous: number | null
): MarkDelta | null {
  if (!SHARED_SOCCER_KEYS.has(metricKey)) return null;
  if (current == null || previous == null) return null;
  const change = current - previous;
  const improved = LOWER_BETTER.has(metricKey) ? change < 0 : change > 0;
  return { previous, current, change, improved };
}
```

Max velocity is mph, higher better, so it stays out of `LOWER_BETTER`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/compare.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/compare.ts src/lib/battery/compare.test.ts
git commit -m "feat: compare shared basketball marks to the soccer baseline"
```

---

### Task 9: Battery tables

**Files:**
- Create: `scripts/migrate-testing-battery.sql`

Do not execute this file. Ross runs it on each database before coaches create a battery.

**Step 1: Write the migration**

```sql
-- Testing batteries. Ross runs this. Do not apply from the app.

CREATE TABLE IF NOT EXISTS testing_batteries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  hugo_group TEXT NOT NULL,
  grouping_mode TEXT NOT NULL CHECK (grouping_mode IN ('subteam', 'cutoff')),
  cutoff_n INTEGER,
  senior_grad_year INTEGER NOT NULL,
  comparison_session_id UUID REFERENCES sessions(id),
  bibs_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testing_battery_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battery_id UUID NOT NULL REFERENCES testing_batteries(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  label TEXT NOT NULL,
  session_date DATE,
  session_id UUID REFERENCES sessions(id),
  sort_order INTEGER NOT NULL,
  rest_seconds INTEGER,
  closed_at TIMESTAMPTZ,
  locked_dri_box TEXT,
  UNIQUE (battery_id, day_key)
);

CREATE TABLE IF NOT EXISTS testing_battery_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battery_id UUID NOT NULL REFERENCES testing_batteries(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE (battery_id, group_key)
);

CREATE TABLE IF NOT EXISTS testing_battery_group_members (
  group_id UUID NOT NULL REFERENCES testing_battery_groups(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS testing_battery_bibs (
  battery_id UUID NOT NULL REFERENCES testing_batteries(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  bib TEXT NOT NULL,
  grade_digit INTEGER NOT NULL,
  alpha_index INTEGER NOT NULL,
  PRIMARY KEY (battery_id, athlete_id),
  UNIQUE (battery_id, bib)
);

CREATE TABLE IF NOT EXISTS testing_battery_lane_sheets (
  battery_id UUID PRIMARY KEY REFERENCES testing_batteries(id) ON DELETE CASCADE,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heats JSONB NOT NULL
);

ALTER TABLE entries ADD COLUMN IF NOT EXISTS qualifier TEXT;
```

`qualifier` holds the RSI majority label: `reactive`, `compliant`, `stiff`, or `developing`. It stays null on every other metric.

**Step 2: Commit**

```bash
git add scripts/migrate-testing-battery.sql
git commit -m "feat: add testing battery tables"
```

---

### Task 10: Boys basketball template

**Files:**
- Create: `src/lib/battery/template.ts`
- Test: `src/lib/battery/template.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { BOYS_BASKETBALL_BASELINE } from "./template";

describe("BOYS_BASKETBALL_BASELINE", () => {
  it("puts DRI on Monday and leaves Friday as the 10x10", () => {
    expect(BOYS_BASKETBALL_BASELINE.days.map((day) => day.session_date)).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
    const monday = BOYS_BASKETBALL_BASELINE.days[0];
    expect(monday.metric_keys).toEqual(["10-5_RSI", "40yd_Dash", "DRI"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].metric_keys).toEqual(["10x10m"]);
    expect(BOYS_BASKETBALL_BASELINE.days[2].rest_seconds).toBe(10);
    expect(BOYS_BASKETBALL_BASELINE.cutoff_n).toBe(18);
    expect(BOYS_BASKETBALL_BASELINE.senior_grad_year).toBe(2027);
    expect(BOYS_BASKETBALL_BASELINE.comparison_date).toBe("2026-09-02");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/template.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export const BOYS_BASKETBALL_BASELINE = {
  title: "Boys Basketball Baseline",
  hugo_group: "mens_basketball",
  grouping_mode: "cutoff" as const,
  cutoff_n: 18,
  senior_grad_year: 2027,
  comparison_date: "2026-09-02",
  comparison_hugo_group: "soccer",
  days: [
    {
      day_key: "A",
      label: "Rate and Reactivity",
      session_date: "2026-11-16",
      sort_order: 1,
      rest_seconds: null,
      metric_keys: ["10-5_RSI", "40yd_Dash", "DRI"],
    },
    {
      day_key: "B",
      label: "Magnitude",
      session_date: "2026-11-18",
      sort_order: 2,
      rest_seconds: null,
      metric_keys: ["Standing-Broad", "Vertical Jump", "OH-MB_Throw"],
    },
    {
      day_key: "C",
      label: "Capacity",
      session_date: "2026-11-20",
      sort_order: 3,
      rest_seconds: 10,
      metric_keys: ["10x10m"],
    },
  ],
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/template.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/template.ts src/lib/battery/template.test.ts
git commit -m "feat: seed the boys basketball baseline dates"
```

---

### Task 11: Assemble one athlete row

**Files:**
- Create: `src/lib/battery/score-row.ts`
- Test: `src/lib/battery/score-row.test.ts`

This is the seam between entries and the board. It does not hit the database. The caller passes already-best marks.

Column directions:

| Key | Direction |
| --- | --- |
| 10-5_RSI, DRI, Standing-Broad, Vertical Jump, OH-MB_Throw, MaxVelocity | higher |
| 20yd_Dash, 40yd_Dash, 10x10m_best, 10x10m_mean, 10x10m_decrement | lower |

DRI's value on the row is the mark at `teamBox` only. The row also carries `dri_band`, `dri_peak_box`, and `higher_box`.

**Step 1: Write the failing test**

Build a two-athlete fixture. Athlete `a` has RSI 2.4, 0-40 of 4.8 s, DRI 2.2 at 12 in and 2.6 at 18 in. Athlete `b` has RSI 1.8, 0-40 of 5.1 s, DRI 1.4 at 12 in. Team box is 12.

Assert:

- `a` ranks 1st on RSI with 2 points and 1st on DRI with 2 points
- `a.dri_band` is `Bouncy`
- `a.higher_box` is true because the peak box is 18
- `b.higher_box` is false
- `a` beats `b` on the 40, so `a` has the higher total
- neither row has a 10×10 slot completed

Use `rankFullField` inside the assembler so this test fails if Task 1's tie rule is bypassed.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/battery/score-row.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

`scoreBatteryRows` takes:

```ts
export type BatteryMark = {
  athlete_id: string;
  key: string;
  value: number;
};

export type BatteryAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  dri_marks: { box: string; value: number }[];
};

export function scoreBatteryRows(input: {
  athletes: BatteryAthlete[];
  marks: BatteryMark[];
  teamBox: string | null;
  poolIds?: string[];
}): ScoredBatteryRow[]
```

Steps inside the function:

1. If `poolIds` is set, keep only those athletes. Group pages pass the sub-team. The overall page passes everyone.
2. For DRI, emit one mark per athlete whose `dri_marks` include `teamBox`. Ignore their other boxes for points.
3. Rank each key with `rankFullField` and the direction table.
4. Call `batteryTotal` per athlete.
5. Attach `driBand`, `peakBox`, and `higherBoxFlag`.
6. Sort by `total_points` desc, then `slots_completed` desc, then last name, first name, id.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/battery/score-row.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/battery/score-row.ts src/lib/battery/score-row.test.ts
git commit -m "feat: score a battery roster from best marks"
```

---

### Task 12: Load and serve the board

**Files:**
- Create: `src/lib/battery/load.ts`
- Create: `src/app/api/battery/[id]/board/route.ts`
- Create: `src/app/api/battery/route.ts`
- Modify: `src/app/api/entries/route.ts` so a POST body field `qualifier` is written to `entries.qualifier` on the inserted RSI row

`load.ts` uses `sql` from `@/lib/db`. It loads the battery, its days, bibs, group members, and entries for the linked session ids plus `comparison_session_id`.

Sprint marks for both the basketball sessions and the soccer session go through `pickBestTwentyYdHits` and `pickBestMaxVelocityHits`. Do not write a second sprint parser.

DRI team box: if `testing_battery_days.locked_dri_box` is set for day A, use it. Otherwise call `pickTeamDriBox` on the open marks.

10×10: group `interval_index` 1–10 per athlete. Call `scoreRepeatSprint`. Only emit `10x10m_best`, `10x10m_mean`, and `10x10m_decrement` when it returns a score.

Soccer: for each shared key, call `compareMark`. Leave `delta` null when the athlete has no September 2 row.

`GET /api/battery/[id]/board` is public, same as `/api/leaderboard`. Query params:

- `view=today|meet` (default `today`)
- `group=overall` or a `group_key`

Today's columns are the open day's keys. If no day is open, today is the last day. The meet includes every key that has at least one mark, plus the three sprint columns when a 40 exists.

Response shape:

```ts
{
  battery: { id, title, grouping_mode, cutoff_n, team_dri_box, team_dri_locked },
  view: "today" | "meet",
  columns: { key, label, direction, units }[],
  athletes: {
    athlete_id, bib, first_name, last_name, group_key,
    total_points, slots_completed,
    qualifier, higher_box,
    cells: Record<string, { value, rank, tied, points, band?, delta? }>
  }[],
  untested_ids: string[]
}
```

An athlete is untested when every cell for this view is empty. They stay in `athletes` too, at the bottom, so the gym can draw the divider. `cutoff_n` athletes with at least one cell fill the line. Untested ids do not.

`POST /api/battery` is coach-only (`getServerSession`, 401 if missing). Body `{ template: "boys_basketball_baseline" }` inserts the battery and three day rows from `BOYS_BASKETBALL_BASELINE`. It does not create sessions. The coach links a session id later with `PATCH /api/battery/[id]/days` `{ day_key, session_id }`.

`POST /api/battery/[id]/days/close` with `{ day_key }` sets `closed_at` and, for day A, writes `locked_dri_box` from `pickTeamDriBox`. Coach-only.

**Verify**

Run: `npx vitest run src/lib/battery`

Expected: PASS. This task has no new unit test if the SQL loader is thin. Do not mock Postgres. The scoring test in Task 11 covers the board math.

**Commit**

```bash
git add src/lib/battery/load.ts src/app/api/battery src/app/api/entries/route.ts
git commit -m "feat: serve the basketball battery board"
```

---

### Task 13: Gym board

**Files:**
- Create: `src/app/battery/[id]/page.tsx`
- Create: `src/app/battery/[id]/BatteryBoard.tsx`

Public page. No coach session. `useSWR` on `/api/battery/${id}/board?view=&group=` with `refreshInterval: 5000`, matching the live leaderboard.

Layout, desktop width first:

- Header: day label, view toggle Today / Meet, group chips when `grouping_mode` is `subteam`
- Twelve data rows. Rank, bib, name, one compact cell per column, total, and `slots_completed/9`
- A shared cell shows the mark, the place, and a small delta (`-0.06` or `+0.4`) when `delta` is present
- A DRI cell shows the band label under the mark
- An RSI cell shows a color dot from `qualifier`
- After the last athlete who has a mark and whose place is `cutoff_n`, draw a full-width line labeled with the cutoff. Ties that share that place stay above it
- Then the untested block

Page size is 12. Auto-advance every 8 seconds. A click pauses. Group chips set `group` and reset to page 1.

Check in the browser at a wide viewport: 12 rows visible, the cutoff line between 18 and 19 when 20 athletes have marks, and a soccer delta on broad jump when the fixture has a previous mark. Use a local battery id. If the migration has not been applied, say so and skip the live check.

**Commit**

```bash
git add src/app/battery
git commit -m "feat: show the basketball meet on a gym board"
```

---

### Task 14: Bib-first entry

**Files:**
- Create: `src/app/api/battery/[id]/bibs/route.ts`
- Modify: `src/app/data-entry/EntryForm.tsx`

`POST /api/battery/[id]/bibs` is coach-only.

- No `bibs_issued_at`: call `assignBibs` with the men's basketball roster (`athlete_hugo_memberships` where `hugo_group = 'mens_basketball'`), replace rows in `testing_battery_bibs`, return the sheet data, leave `bibs_issued_at` null.
- Body `{ issue: true }`: same assign, then set `bibs_issued_at = NOW()` if it was null.
- After issue: pass the existing bib rows as `issued`. New athletes get the next number. Do not update a bib that is already stored.

`GET` returns `{ bib, athlete_id, first_name, last_name, grade_digit }[]` for the entry screen. Coach-only is fine here because entry is coach-only.

In `EntryForm`, when the selected session id is one of the battery's `session_id`s:

- Load the bib list once with the session
- Show a numeric bib field, `inputMode="numeric"`, max length 3
- On the third digit, find the bib locally. Show the name in large type. Unknown bib sets an error and blocks save
- Keep the current metric selected after a successful save, clear the bib, and focus the bib field
- RSI save sends `qualifier` along with `raw_input`. Four buttons: Reactive, Compliant, Stiff, Developing. The POST already accepts `qualifier` from Task 12
- DRI save sends one raw string of four comma-separated numbers
- 10×10 save sends ten times
- The name search stays on the page as a fallback

**Verify**

Run: `npx vitest run src/lib/battery/bibs.test.ts src/lib/battery/parse-station.test.ts`

Expected: PASS

Browser: with a coach session, type a known bib and confirm the name appears before save. Type `999` and confirm nothing saves.

**Commit**

```bash
git add src/app/api/battery/[id]/bibs/route.ts src/app/data-entry/EntryForm.tsx
git commit -m "feat: enter battery marks by bib"
```

---

### Task 15: Hand sheet, lane sheet, and report extras

**Files:**
- Create: `src/app/api/battery/[id]/lanes/route.ts`
- Create: `src/lib/battery/hand-sheet.tsx`
- Create: `src/lib/battery/lane-sheet.tsx`
- Modify: the coach testing-day or battery page with two download links

Hand sheet (`@react-pdf/renderer`, same pattern as `src/lib/norms/testing-day-pdf.tsx`): grouped by grade digit, bib in large type, last name, first name, a few blank rows. Title `Boys Basketball Baseline`.

Lane route, coach-only:

- `GET` returns the frozen heats if a row exists in `testing_battery_lane_sheets`
- `POST` builds heats only when no row exists. Place order is the meet board with days A and B only (`view=meet` filtered to those session ids), athletes who have at least one mark first, then untested by name. Call `seedLanes`. Store the JSON. A second POST returns the stored heats and does not recompute
- A late athlete who is not in the frozen heats is absent from the sheet. The coach adds them by hand. Do not reshuffle

Lane PDF columns: heat, lane, bib, name, place. Header includes `10×10 · 10s`. Mark the cutoff between the heat that contains place 18 and the next heat.

Coach packet extras, on the battery PDF rather than inside the old soccer testing-day PDF:

- Four DRI boxes, band labels, team box, and the higher-box flag sentence when `higher_box` is true: "Higher eccentric load than the team box."
- RSI qualifier as the color name
- Sept 2 value and change on the shared keys

**Verify**

Run: `npx vitest run src/lib/battery/lanes.test.ts`

Expected: PASS

**Commit**

```bash
git add src/app/api/battery/[id]/lanes/route.ts src/lib/battery/hand-sheet.tsx src/lib/battery/lane-sheet.tsx
git commit -m "feat: print bib hands and frozen Friday lanes"
```

---

### Task 16: Regression check

**Step 1: Run the battery tests and the old ranking tests**

Run: `npx vitest run src/lib/battery src/lib/norms/testing-day-rank.test.ts src/lib/norms/testing-day-derived.test.ts`

Expected: PASS. `pointsForPlace(9)` is still 0.

**Step 2: Lint**

Run: `npm run lint`

Expected: no new errors in `src/lib/battery` or `src/app/battery`.

**Step 3: Do not migrate**

Leave `scripts/migrate-testing-battery.sql` unapplied. Tell Ross the file is ready and which database he should run it on before creating the battery or printing bibs.
