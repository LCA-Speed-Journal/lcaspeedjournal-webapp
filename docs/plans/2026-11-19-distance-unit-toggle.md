# Distance Unit Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let coaches enter a distance mark in feet-inches, inches, centimeters, or meters, and show bounds, throws, and horizontal jumps as feet-inches on every board.

**Architecture:** A small pure module parses the four entry units and converts them into the metric’s stored units. `display_value` stays in the metric’s existing display unit so ranking does not change. Feet stay decimal feet in the database (`6-6` is `6.5`) and a shared formatter prints `6' 6"`. A nullable `measured_unit` column remembers which unit the coach picked so a later edit can reinterpret the same raw text.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel Postgres (`sql` tagged templates).

**Working directory:** `C:\Users\rossp\OneDrive\Documents\Python Scripts\2026 Coding\lcaspeedjournal-webapp-clean`

**Commits:** This machine uses PowerShell. Do not use a bash heredoc. Commit with `git commit -m "message"`. Do not push. Do not update git config.

---

## Locked decisions

- Entry choices are `ft_in`, `in`, `cm`, and `m`.
- Feet-inches text: `6-6`, `6' 6"`, `6'6"`, `6ft 6`, `6ft 6in`, and a decimal inch such as `6ft 6.5in`. A bare number under the feet-inches toggle is decimal feet (`45` and `39.5` stay valid for shot put).
- Inches text: `34.5`, `34.5"`, `34.5in`. Centimeters: `200` or `200cm`. Meters: `2.05` or `2.05m`.
- The toggle wins for a bare number. If the text names a different unit, reject the save.
- Store feet as decimal feet. Display `6' 6"` when the inch is whole, and `6' 7.5"` when it is not. `6.9` feet displays as `6' 10.8"`. Do not append a separate `ft` label.
- Bounds, throws, and horizontal jumps display as feet-inches. Their `display_units` stay `"ft"`. Do not invent a new display-unit string. Meet jumps that already display as feet use the same formatter. Verticals stay inches. Kosmin and `24/28s_Drill` stay meters.
- Horizontal jumps and throws default the toggle to feet-inches. Bounds, meet jumps, and the meter-distance drills default to meters. Verticals default to inches.
- For horizontal jumps and throws, both `value` and `display_value` are decimal feet even when the coach typed centimeters. `measured_unit` records the typed unit.
- Other distance metrics keep `value` in `input_units` and `display_value` in `display_units`.
- Conversion factors already in the app: centimeters to feet is `/ 30.48`, meters to feet is `* 3.281`, inches are 12 per foot and 2.54 cm per inch.
- Existing rows for metrics whose default changes get `measured_unit` backfilled (`cm` or `m`). Do not rewrite their numbers. Null means the metric’s new default.
- The Override units box cannot move a distance mark off its display unit.

## Registry edits

In `src/lib/metrics.json`, set `input_units` to `"ft"` and `conversion_formula` to `""` for:

- Seated-Broad, Standing-Broad, MB-Broad, Depth-Broad_8, Depth-Broad_12, Depth-Broad_18, Triple-Broad
- OH-MB_Throw, UH-MB_Throw

Leave `display_units` as `"ft"`. ShotPut, Discus, Shotput_PWR, and Discus_PWR are already feet. Standing-Triple and 5-Bound stay `input_units` `"m"` and `display_units` `"ft"`.

## Context the implementer needs

`parseEntry` in `src/lib/parser.ts` (about line 116) takes `(metricKey, rawInput, sessionOverrides)` and returns rows with `value`, `display_value`, and `units`. Single-interval parsing (about line 330) already accepts a unit suffix and, for a cm-to-feet metric, treats `8.25ft` as feet while storing `value` in centimeters. That Standing-Broad behavior changes when the registry default becomes feet. Update `src/lib/parser.test.ts` in the same task. Do not change cumulative, paired, or speed-run parsing.

`POST /api/entries` calls `parseEntry` around line 263 and inserts through `insertStandardEntry` in `src/app/api/entries/route.ts` (about line 52). `PATCH /api/entries/[id]` re-parses `raw_input` around line 187 of `src/app/api/entries/[id]/route.ts`. The edit dialog is `src/app/data-entry/session/[id]/EditSessionClient.tsx`. The entry form posts from `src/app/data-entry/EntryForm.tsx` around line 1004. The raw field is around line 1747.

Boards format a number with `toFixed` and then print `units`. Battery sheets already print feet-inches but round to a whole inch in `formatFeetInches` inside `src/app/battery/[id]/BatteryBoard.tsx` (about line 244), `src/lib/battery/door-sheet.ts` (about line 159), and `src/lib/battery/meet-sheet.tsx` (about line 110). Replace those three local functions with the shared one.

`distance_unit` on `entries` is the speed-window interval unit (`m` or `yd`). Do not reuse it. The new column is `measured_unit`.

---

### Task 1: Feet-inches display

**Files:**
- Create: `src/lib/distance-units.ts`
- Test: `src/lib/distance-units.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { formatFeetInches } from "./distance-units";

describe("formatFeetInches", () => {
  it("prints a whole inch without a decimal", () => {
    expect(formatFeetInches(6.5)).toBe("6' 6\"");
  });

  it("keeps a tenth of an inch", () => {
    expect(formatFeetInches(6 + 7.5 / 12)).toBe("6' 7.5\"");
  });

  it("carries 10.8 inches from 6.9 feet", () => {
    expect(formatFeetInches(6.9)).toBe("6' 10.8\"");
  });

  it("rolls 12 inches into the next foot", () => {
    expect(formatFeetInches(6 + 11.96 / 12)).toBe("7' 0\"");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/distance-units.test.ts`

Expected: FAIL with `formatFeetInches` not defined.

**Step 3: Write minimal implementation**

```typescript
export function formatFeetInches(feet: number): string {
  const sign = feet < 0 ? "-" : "";
  const abs = Math.abs(feet);
  let whole = Math.floor(abs + 1e-9);
  let inches = Math.round((abs - whole) * 12 * 10) / 10;
  if (inches >= 12) {
    whole += 1;
    inches = 0;
  }
  const inchText = Number.isInteger(inches) ? String(inches) : inches.toFixed(1);
  return `${sign}${whole}' ${inchText}"`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/distance-units.test.ts`

Expected: PASS

**Step 5: Commit**

```powershell
git add src/lib/distance-units.ts src/lib/distance-units.test.ts
git commit -m "feat: format stored feet as feet and inches"
```

---

### Task 2: Parse the four entry units

**Files:**
- Modify: `src/lib/distance-units.ts`
- Test: `src/lib/distance-units.test.ts`

**Step 1: Write the failing test**

Add this describe block. Import `parseDistanceMagnitude` and `DistanceUnit`.

```typescript
describe("parseDistanceMagnitude", () => {
  it("reads feet-inches spellings as decimal feet", () => {
    const samples = ["6-6", "6' 6\"", "6'6\"", "6ft 6", "6ft 6in", "6ft 6.5in"];
    const feet = samples.map((raw) => parseDistanceMagnitude(raw, "ft_in"));
    expect(feet.slice(0, 5).every((n) => Math.abs(n - 6.5) < 1e-9)).toBe(true);
    expect(feet[5]).toBeCloseTo(6 + 6.5 / 12, 6);
  });

  it("reads a bare number under feet-inches as decimal feet", () => {
    expect(parseDistanceMagnitude("45", "ft_in")).toBe(45);
    expect(parseDistanceMagnitude("39.5", "ft_in")).toBe(39.5);
  });

  it("reads inches, centimeters, and meters", () => {
    expect(parseDistanceMagnitude("34.5\"", "in")).toBe(34.5);
    expect(parseDistanceMagnitude("34.5in", "in")).toBe(34.5);
    expect(parseDistanceMagnitude("200cm", "cm")).toBe(200);
    expect(parseDistanceMagnitude("2.05m", "m")).toBe(2.05);
  });

  it("rejects a unit suffix that disagrees with the toggle", () => {
    expect(() => parseDistanceMagnitude("200cm", "ft_in")).toThrow(/unit/i);
    expect(() => parseDistanceMagnitude("6-6", "cm")).toThrow(/unit/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/distance-units.test.ts`

Expected: FAIL with `parseDistanceMagnitude` not defined.

**Step 3: Write minimal implementation**

Add to `src/lib/distance-units.ts`:

```typescript
export type DistanceUnit = "ft_in" | "in" | "cm" | "m";

const FEET_INCHES =
  /^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot|-)\s*(\d+(?:\.\d+)?)(?:\s*(?:"|in|inch|inches))?\s*$/i;

export function parseDistanceMagnitude(raw: string, unit: DistanceUnit): number {
  const text = raw.trim();
  if (unit === "ft_in") {
    const feetInches = text.match(FEET_INCHES);
    if (feetInches) {
      return Number(feetInches[1]) + Number(feetInches[2]) / 12;
    }
    const feet = text.match(/^(-?\d+(?:\.\d+)?)(?:\s*(?:ft|feet|foot|'|" ))?\s*$/i);
    if (!feet) throw new Error(`Cannot parse feet-inches "${raw}"`);
    if (/(cm|meter|metre|\bm\b|in|inch)/i.test(text)) {
      throw new Error(`Unit in "${raw}" does not match feet-inches`);
    }
    return Number(feet[1]);
  }

  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*([a-z"']+)?\s*$/i);
  if (!match) throw new Error(`Cannot parse ${unit} "${raw}"`);
  const suffix = (match[2] ?? "").toLowerCase();
  const ok =
    suffix === "" ||
    (unit === "in" && (suffix === "in" || suffix === "inch" || suffix === "inches" || suffix === '"')) ||
    (unit === "cm" && suffix === "cm") ||
    (unit === "m" && (suffix === "m" || suffix === "meter" || suffix === "meters" || suffix === "metre" || suffix === "metres"));
  if (!ok) throw new Error(`Unit in "${raw}" does not match ${unit}`);
  return Number(match[1]);
}
```

Tighten the feet-inches regex if `6' 6"` fails the first test. The pattern must accept a missing inch number only when the text is a plain foot count, which the second branch covers. `6ft 6` must hit the first branch.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/distance-units.test.ts`

Expected: PASS

**Step 5: Commit**

```powershell
git add src/lib/distance-units.ts src/lib/distance-units.test.ts
git commit -m "feat: parse feet-inches, inches, centimeters, and meters"
```

---

### Task 3: Convert into stored units

**Files:**
- Modify: `src/lib/distance-units.ts`
- Test: `src/lib/distance-units.test.ts`

**Step 1: Write the failing test**

```typescript
describe("storedDistance", () => {
  it("keeps a feet-inches jump in decimal feet", () => {
    const stored = storedDistance({
      raw: "6-6",
      measuredUnit: "ft_in",
      inputUnits: "ft",
      displayUnits: "ft",
    });
    expect(stored.value).toBeCloseTo(6.5, 5);
    expect(stored.displayValue).toBeCloseTo(6.5, 5);
    expect(stored.units).toBe("ft");
  });

  it("converts centimeters into feet for a jump", () => {
    const stored = storedDistance({
      raw: "198.12",
      measuredUnit: "cm",
      inputUnits: "ft",
      displayUnits: "ft",
    });
    expect(stored.displayValue).toBeCloseTo(6.5, 2);
    expect(stored.value).toBeCloseTo(6.5, 2);
  });

  it("stores a bound in meters and displays feet", () => {
    const stored = storedDistance({
      raw: "12.5",
      measuredUnit: "m",
      inputUnits: "m",
      displayUnits: "ft",
    });
    expect(stored.value).toBe(12.5);
    expect(stored.displayValue).toBeCloseTo(12.5 * 3.281, 5);
    expect(stored.units).toBe("ft");
  });

  it("stores a vertical entered in centimeters as inches", () => {
    const stored = storedDistance({
      raw: "76.2",
      measuredUnit: "cm",
      inputUnits: "in",
      displayUnits: "in",
    });
    expect(stored.displayValue).toBeCloseTo(30, 2);
    expect(stored.value).toBeCloseTo(30, 2);
    expect(stored.units).toBe("in");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/distance-units.test.ts`

Expected: FAIL with `storedDistance` not defined.

**Step 3: Write minimal implementation**

```typescript
const CM_PER_FT = 30.48;
const M_TO_FT = 3.281;

export function defaultDistanceUnit(inputUnits: string): DistanceUnit | null {
  const unit = inputUnits.toLowerCase();
  if (unit === "ft" || unit === "feet") return "ft_in";
  if (unit === "in" || unit === "inch" || unit === "inches") return "in";
  if (unit === "cm") return "cm";
  if (unit === "m" || unit === "meter" || unit === "meters") return "m";
  return null;
}

function toFeet(magnitude: number, unit: DistanceUnit): number {
  if (unit === "ft_in") return magnitude;
  if (unit === "in") return magnitude / 12;
  if (unit === "cm") return magnitude / CM_PER_FT;
  return magnitude * M_TO_FT;
}

function fromFeet(feet: number, storedUnits: string): number {
  const unit = storedUnits.toLowerCase();
  if (unit === "ft" || unit === "feet") return feet;
  if (unit === "in" || unit === "inch" || unit === "inches") return feet * 12;
  if (unit === "cm") return feet * CM_PER_FT;
  if (unit === "m" || unit === "meter" || unit === "meters") return feet / M_TO_FT;
  throw new Error(`Cannot store distance as ${storedUnits}`);
}

export function storedDistance(input: {
  raw: string;
  measuredUnit: DistanceUnit;
  inputUnits: string;
  displayUnits: string;
}): { value: number; displayValue: number; units: string } {
  const magnitude = parseDistanceMagnitude(input.raw, input.measuredUnit);
  const feet = toFeet(magnitude, input.measuredUnit);
  return {
    value: fromFeet(feet, input.inputUnits),
    displayValue: fromFeet(feet, input.displayUnits),
    units: input.displayUnits,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/distance-units.test.ts`

Expected: PASS

**Step 5: Commit**

```powershell
git add src/lib/distance-units.ts src/lib/distance-units.test.ts
git commit -m "feat: convert entered distance into stored units"
```

---

### Task 4: Use the converter in the parser

**Files:**
- Modify: `src/lib/parser.ts` (`parseEntry` about line 116, `parseSingleInterval` about line 207)
- Test: `src/lib/parser.test.ts` (the throw-metrics describe, about line 62)

**Step 1: Write the failing test**

Replace the Standing-Broad example that expects a bare centimeter, and add the new cases inside `describe("parseEntry throw metrics in feet")`:

```typescript
it("reads Standing-Broad feet-inches as decimal feet", () => {
  const [row] = parseEntry("Standing-Broad", "6-6", undefined, { measuredUnit: "ft_in" });
  expect(row.display_value).toBeCloseTo(6.5, 5);
  expect(row.value).toBeCloseTo(6.5, 5);
  expect(row.units).toBe("ft");
});

it("converts Standing-Broad centimeters when the toggle says cm", () => {
  const [row] = parseEntry("Standing-Broad", "198.12", undefined, { measuredUnit: "cm" });
  expect(row.display_value).toBeCloseTo(6.5, 2);
  expect(row.units).toBe("ft");
});

it("rejects a centimeter suffix while the toggle is feet-inches", () => {
  expect(() => parseEntry("ShotPut", "200cm", undefined, { measuredUnit: "ft_in" })).toThrow(/unit/i);
});
```

This test fails twice until Task 5 lands: `6-6` is not parsed, and Standing-Broad still treats the number as centimeters because `input_units` is still `cm`. Do Task 5’s registry edit in the same implementation step if you want one green run. Do not leave the suite red across commits. The order below is: add the test, change the registry, then change the parser, then one commit.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/parser.test.ts -t "Standing-Broad"`

Expected: FAIL. Either `measuredUnit` is ignored or `6-6` throws `Cannot parse`.

**Step 3: Write minimal implementation**

Change the registry rows listed under “Registry edits” first.

Extend `parseEntry` with an optional fourth argument:

```typescript
export type ParseEntryOptions = {
  measuredUnit?: "ft_in" | "in" | "cm" | "m";
};

export function parseEntry(
  metricKey: string,
  rawInput: string,
  sessionOverrides?: SessionOverrides,
  options?: ParseEntryOptions
): ParsedEntry[]
```

Pass `options` into `parseSingleInterval`. At the start of the single-value path (one token, not a multi-split), if `defaultDistanceUnit(metric.input_units)` is not null:

```typescript
const measuredUnit = options?.measuredUnit ?? defaultDistanceUnit(metric.input_units)!;
const stored = storedDistance({
  raw: rawInput.trim(),
  measuredUnit,
  inputUnits: metric.input_units,
  displayUnits: metric.display_units,
});
return [{
  metric_key: metric.display_name,
  interval_index: null,
  component: null,
  value: stored.value,
  display_value: stored.displayValue,
  units: stored.units,
}];
```

Leave the existing split-metric branch (several pipe-separated times) on the old path. Distance metrics in this registry are one number.

Update the old Standing-Broad assertions in `parser.test.ts` that expect a bare `251.46` to be centimeters and `8.25ft` to rewrite `value` into centimeters. After the registry change, a bare number and `8.25ft` are feet in both columns. Keep a centimeter case only when `measuredUnit` is `"cm"`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/parser.test.ts src/lib/distance-units.test.ts`

Expected: PASS. If another test assumed Standing-Broad or OH-MB input was centimeters or meters, update that test to the new default or pass `measuredUnit`.

**Step 5: Commit**

```powershell
git add src/lib/parser.ts src/lib/parser.test.ts src/lib/metrics.json
git commit -m "feat: parse distance entries in the selected unit"
```

---

### Task 5: Remember the unit on the row

**Files:**
- Create: `scripts/migrate-measured-unit.sql`
- Modify: `src/app/api/entries/route.ts` (`insertStandardEntry` about line 52, `POST` about line 263)
- Modify: `src/app/api/entries/[id]/route.ts` (raw re-parse about line 187)
- Modify: `src/lib/distance-units.ts` (add `readMeasuredUnit`)
- Test: `src/lib/distance-units.test.ts`

**Step 1: Write the failing test**

```typescript
describe("readMeasuredUnit", () => {
  it("accepts the four units and ignores anything else", () => {
    expect(readMeasuredUnit("ft_in")).toBe("ft_in");
    expect(readMeasuredUnit("cm")).toBe("cm");
    expect(readMeasuredUnit("feet")).toBeNull();
    expect(readMeasuredUnit(undefined)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/distance-units.test.ts -t "readMeasuredUnit"`

Expected: FAIL with `readMeasuredUnit` not defined.

**Step 3: Write minimal implementation**

```typescript
export function readMeasuredUnit(value: unknown): DistanceUnit | null {
  if (value === "ft_in" || value === "in" || value === "cm" || value === "m") return value;
  return null;
}
```

SQL file `scripts/migrate-measured-unit.sql`:

```sql
ALTER TABLE entries ADD COLUMN IF NOT EXISTS measured_unit text;

UPDATE entries
SET measured_unit = 'cm'
WHERE measured_unit IS NULL
  AND metric_key IN (
    'Seated-Broad', 'Standing-Broad', 'MB-Broad',
    'Depth-Broad_8', 'Depth-Broad_12', 'Depth-Broad_18'
  );

UPDATE entries
SET measured_unit = 'm'
WHERE measured_unit IS NULL
  AND metric_key IN ('Triple-Broad', 'OH-MB_Throw', 'UH-MB_Throw');
```

In `POST`, read `measured_unit` with `readMeasuredUnit(body.measured_unit)`. Pass it as the fourth argument to `parseEntry`. Add `measured_unit` to `StandardEntryInsert` and to the `INSERT` column list. Copy the missing-column fallback already used for speed-window columns: if Postgres says `measured_unit` does not exist (`42703`), insert without that column. Include `measured_unit` in the `GET` select lists around lines 155 and 169 so the edit screen can load it.

In `PATCH`, when the body has `raw_input`, pass `readMeasuredUnit(body.measured_unit)` into `parseEntry`. On the re-parse `UPDATE`, also set `measured_unit`. If the column is missing, update the other fields only. When the body is an override (`display_value` / `units`) and the metric’s `defaultDistanceUnit(input_units)` is not null, ignore a `units` value that is not the metric’s `display_units` and keep the stored display unit. Still allow the numeric override.

Do not put `measured_unit` on speed-run inserts. Those rows are times.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/distance-units.test.ts src/lib/parser.test.ts`

Expected: PASS

Run the SQL against the local database when it is available. The API must still save if the column is not there yet.

**Step 5: Commit**

```powershell
git add scripts/migrate-measured-unit.sql src/app/api/entries/route.ts src/app/api/entries/[id]/route.ts src/lib/distance-units.ts src/lib/distance-units.test.ts
git commit -m "feat: store the distance unit used at entry"
```

---

### Task 6: Toggle on data entry

**Files:**
- Modify: `src/app/data-entry/EntryForm.tsx` (state near line 225, post body near line 1004, raw field near line 1747)
- Modify: `src/lib/metric-utils.ts` only if `sessionSetupMetricOptions` does not already return `input_units` and `display_units`. It does return `input_units` (see `metricOptions` in `EntryForm.tsx` about line 88).

**Step 1: Write the failing test**

There is no component test harness for this form. Cover the choice in the pure helper instead of a new UI test.

```typescript
it("maps a feet metric to the feet-inches toggle", () => {
  expect(defaultDistanceUnit("ft")).toBe("ft_in");
  expect(defaultDistanceUnit("cm")).toBe("cm");
  expect(defaultDistanceUnit("s")).toBeNull();
});
```

Run: `npx vitest run src/lib/distance-units.test.ts -t "feet metric"`

Expected: PASS if Task 3 already added `defaultDistanceUnit`. If it fails, the helper was not exported. Fix that before the UI.

**Step 2: Add the control**

Keep a `Record<string, DistanceUnit>` in component state, keyed by metric. When the selected metric’s `defaultDistanceUnit(inputUnits)` is null, hide the control. Otherwise show four buttons labeled `ft-in`, `in`, `cm`, `m`. The active choice is the remembered value or the default. Put the control directly above the raw input. Change `inputHint` so a distance metric says `e.g. 6-6 (ft-in)` or `e.g. 200 (cm)` from the active choice, not only `input_units`.

Add `measured_unit` to the JSON body next to `raw_input` only when the control is visible.

**Step 3: Check the form by hand**

With `npm run dev`, open data entry, pick Standing-Broad, confirm the toggle starts on `ft-in`, enter `6-6`, and save. The session list will still show `6.5` until Task 7. Switch the toggle to `cm`, enter `200`, and save. Pick 40yd and confirm the toggle is absent.

**Step 4: Commit**

```powershell
git add src/app/data-entry/EntryForm.tsx
git commit -m "feat: choose a distance unit while entering a mark"
```

---

### Task 7: Toggle on edit, and feet-inches everywhere a mark is shown

**Files:**
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx` (entry type about line 61, `openEdit` about line 218, raw pane about line 664, value cell about line 567)
- Modify: `src/app/leaderboard/LeaderboardClient.tsx` (mark about line 847, `formatValue` about line 936)
- Modify: `src/app/historical/HistoricalClient.tsx` (`formatValue` about line 52)
- Modify: `src/app/historical/HistoricalLeaderboardBar.tsx` (`formatValue` about line 35)
- Modify: `src/app/historical/ProgressionChart.tsx` (tooltip about line 176)
- Modify: `src/app/athletes/PRsSection.tsx` (about line 53)
- Modify: `src/app/athletes/TeamOverviewDashboard.tsx` (`formatValue` about line 74)
- Modify: `src/app/battery/[id]/BatteryBoard.tsx`, `src/lib/battery/door-sheet.ts`, `src/lib/battery/meet-sheet.tsx` (local `formatFeetInches`)

**Step 1: Write the failing test**

No new test. `formatFeetInches` is already covered. This task only calls it.

**Step 2: Edit dialog**

Add `measured_unit: string | null` to the entry type. In `openEdit`, set the toggle from `readMeasuredUnit(row.measured_unit) ?? defaultDistanceUnit(metric.input_units)`. Show the same four buttons on the Raw pane when that default is not null. Include `measured_unit` in the PATCH body next to `raw_input`. In the value column, if `row.units` is `ft`, print `formatFeetInches(Number(row.display_value))` and leave the Units cell as `ft` only when you are not already showing feet-inches in the value. Prefer the value cell to be `6' 6"` and the units cell to be blank for `ft`, so the row does not read `6' 6" ft`.

On the Override pane for a distance metric, keep the number field and do not offer a free-text units edit.

**Step 3: Boards**

Add a helper next to `formatFeetInches`:

```typescript
export function formatStoredMark(value: number, units: string, plain: (n: number) => string): string {
  if (units.toLowerCase() === "ft" || units.toLowerCase() === "feet") return formatFeetInches(value);
  const body = plain(value);
  return units ? `${body} ${units}` : body;
}
```

Use it where a mark and its unit are printed together. For `ft`, do not add a second unit suffix. Keep each screen’s existing decimal rule for seconds, inches, and meters by passing the current `formatValue` as `plain`. Progression tooltip and axis tick formatter should use it when `units` is `ft`. Chart math stays on the decimal.

Replace the three battery `formatFeetInches` functions with `import { formatFeetInches } from "@/lib/distance-units"`. Delete the local copies. Their `formatMark` already returns early for `ft`, so the shared function changes `6'6"` into `6' 6"` and stops rounding `6.9` feet to `6' 11"`.

Search for other `units === "ft"` or `` `${formatValue` `` call sites under `src/app` and `src/lib` and switch any that print a stored mark. Skip weight-room card page-height inches. Those are layout, not marks.

**Step 4: Run tests and check the screens**

Run: `npx vitest run src/lib/distance-units.test.ts src/lib/parser.test.ts src/lib/battery/door-sheet.test.ts src/lib/battery/meet-sheet.test.ts`

Expected: PASS. If a sheet test expects `6'6"` with no space, or a rounded inch, update the expected string to the shared format.

In the browser, confirm a Standing-Broad leaderboard mark reads `6' 6"`, the historical bar and a progression tooltip match, and editing that entry from `ft-in` to `cm` with raw `198.12` rewrites the mark to about `6' 6"`. Confirm a vertical still reads as inches and a 40-yard time still reads as seconds.

**Step 5: Commit**

```powershell
git add src/app/data-entry/session/[id]/EditSessionClient.tsx src/app/leaderboard/LeaderboardClient.tsx src/app/historical src/app/athletes/PRsSection.tsx src/app/athletes/TeamOverviewDashboard.tsx src/app/battery/[id]/BatteryBoard.tsx src/lib/battery/door-sheet.ts src/lib/battery/meet-sheet.tsx src/lib/distance-units.ts
git commit -m "feat: show jump and throw marks as feet and inches"
```

Add any other display files the search found before committing.

---

## Done when

- Standing-Broad, Triple-Broad, OH-MB_Throw, and ShotPut open with the feet-inches toggle. `6-6` and `45` save as decimal feet and display as feet-inches.
- Switching that toggle to centimeters converts into feet for the board. A mismatched suffix is rejected.
- Standing-Triple still opens on meters and still displays as feet-inches.
- Vertical Jump still opens on inches and still displays as inches.
- An old broad-jump row has `measured_unit` `cm` after the SQL script, and editing it without a unit change does not treat the old raw number as feet.
- `npx vitest run src/lib/distance-units.test.ts src/lib/parser.test.ts` passes.
