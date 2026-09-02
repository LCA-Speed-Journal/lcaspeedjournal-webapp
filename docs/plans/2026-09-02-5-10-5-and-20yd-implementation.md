# 5-10-5 Agility and 20yd Dash Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `5-10-5_Agility` and `20yd_Dash` as Speed Journal intake metrics, and put both on the sport-defaults norms matrix.

**Architecture:** `20yd_Dash` is a yard cumulative like `40yd_Dash` (default splits `[5, 5, 10]`); existing `parseCumulative` already emits named yard windows. `5-10-5_Agility` is a new `sided_optional` parse (one time → `Athlete-Comfort`; two times → `L`, `R`, `Average`) so ISO `paired_components` and its `L-R` % row stay untouched. A shared `isPrimaryResultComponent` helper is the overall-result rule: 20yd → `0-20yd`; 5-10-5 → `Average` or `Athlete-Comfort`. Live 20yd mph extends the existing forty-yd helpers (`10-20yd` mph-primary). Do not map either metric on weight-room cards.

**Tech Stack:** Next.js 16 App Router, React 19, Vitest (`npm test`), `metrics.json` registry, `parseEntry` in `src/lib/parser.ts`.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`). Paths are relative to that root. Run `npm test -- <file>`.

**Do not:** weight-room card/scan mapping; side labels on `5-0-5_Agility` / `5-0-10_Agility`; derive 20yd from a 40yd trial; session `day_components` UI; change ISO `paired_components` (L-R %).

**Reference:** Design [docs/plans/2026-09-02-5-10-5-and-20yd-design.md](./2026-09-02-5-10-5-and-20yd-design.md). Patterns: `src/lib/parser.test.ts` (40yd / agility), `src/lib/norms/forty-yd.ts`, `src/lib/metric-utils.ts`, `src/lib/norms/editor-metrics.ts`. Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

---

### Task 1: `20yd_Dash` registry, parse, and primary component

**Files:**
- Modify: `src/lib/metrics.json` (insert after `40yd_Dash`)
- Modify: `src/lib/parser.test.ts`
- Modify: `src/lib/metric-utils.test.ts`
- Modify: `src/lib/metrics.json` only for the metric def; parser cumulative path needs no code if the JSON is correct

**Step 1: Write the failing tests**

Append to `src/lib/parser.test.ts` (after the existing `40yd_Dash` describe):

```ts
describe("20yd_Dash", () => {
  it("emits yard components for default splits 5+5+10", () => {
    const rows = parseEntry("20yd_Dash", "1.05|1.80|3.05");
    const components = rows.map((r) => r.component);
    expect(components).toContain("0-5yd");
    expect(components).toContain("0-10yd");
    expect(components).toContain("0-20yd");
    expect(components).toContain("5-10yd");
    expect(components).toContain("10-20yd");
    expect(components.some((c) => c?.endsWith("m"))).toBe(false);
    expect(rows.every((r) => r.metric_key === "20yd_Dash")).toBe(true);
    expect(rows.every((r) => r.units === "s")).toBe(true);
  });

  it("accepts a 10yd-only session via day_splits [10]", () => {
    const rows = parseEntry("20yd_Dash", "1.72", {
      day_splits: { "20yd_Dash": [10] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric_key: "20yd_Dash",
      component: "0-10yd",
      display_value: 1.72,
      units: "s",
    });
  });
});
```

Add to `src/lib/metric-utils.test.ts` inside `describe("getPrimaryComponent")`:

```ts
  it("returns 0-20yd for 20yd_Dash", () => {
    expect(getPrimaryComponent("20yd_Dash")).toBe("0-20yd");
  });
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/parser.test.ts src/lib/metric-utils.test.ts`

Expected: FAIL — `Unknown metric: 20yd_Dash` and/or `getPrimaryComponent("20yd_Dash")` is `null`.

**Step 3: Write minimal implementation**

In `src/lib/metrics.json`, immediately after the `40yd_Dash` object, add:

```json
  "20yd_Dash": {
    "display_name": "20yd_Dash",
    "category": "Speed",
    "subcategory": "MaxV",
    "input_units": "s",
    "display_units": "s",
    "conversion_formula": "",
    "input_structure": "cumulative",
    "default_splits": [5, 5, 10],
    "interval_unit": "yd"
  },
```

No parser code change. `parseCumulative` already uses `interval_unit === "yd"`. `getPrimaryComponent` already sums numeric `default_splits`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/parser.test.ts src/lib/metric-utils.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/metrics.json src/lib/parser.test.ts src/lib/metric-utils.test.ts
git commit -m "feat: add 20yd_Dash cumulative metric with 5/10/20 splits"
```

---

### Task 2: 20yd live mph (mirror 40yd)

**Files:**
- Modify: `src/lib/norms/forty-yd.ts`
- Modify: `src/lib/norms/forty-yd.test.ts`
- Modify: `src/lib/norms/editor-metrics.ts` (export `TWENTY_YD_DASH` here so forty-yd can import it — add the constant only; sport-defaults list comes in Task 5)

**Step 1: Write the failing test**

Append to `src/lib/norms/forty-yd.test.ts`:

```ts
describe("live 10-20yd mph on 20yd_Dash", () => {
  it("is only the 10-20yd fly on 20yd_Dash", () => {
    expect(isFortyYardMphPrimary("20yd_Dash", "10-20yd")).toBe(true);
    expect(isFortyYardMphPrimary("20yd_Dash", "5-10yd")).toBe(false);
    expect(isFortyYardMphPrimary("20yd_Dash", "0-20yd")).toBe(false);
    expect(isFortyYardMphPrimary("40yd_Dash", "10-20yd")).toBe(false);
  });

  it("shows mph on short 20yd splits but not the full dash", () => {
    expect(showFortyYardMphSecondary("20yd_Dash", "0-5yd")).toBe(true);
    expect(showFortyYardMphSecondary("20yd_Dash", "5-10yd")).toBe(true);
    expect(showFortyYardMphSecondary("20yd_Dash", "0-10yd")).toBe(true);
    expect(showFortyYardMphSecondary("20yd_Dash", "0-20yd")).toBe(false);
  });

  it("ranks 10-20yd as mph with time underneath", () => {
    const fly = fortyYardLiveReadout("20yd_Dash", "10-20yd", 1.0);
    expect(fly?.primaryUnits).toBe("mph");
    expect(fly?.primaryValue).toBeCloseTo(20.45, 5);
    expect(fly?.secondaryValue).toBe(1.0);
    expect(fly?.secondaryUnits).toBe("s");

    const five = fortyYardLiveReadout("20yd_Dash", "0-5yd", 1.05);
    expect(five?.primaryUnits).toBe("s");
    expect(five?.secondaryUnits).toBe("mph");

    expect(fortyYardLiveReadout("20yd_Dash", "0-20yd", 3.05)).toBeNull();
  });
});
```

Keep existing 40yd assertions; they must still pass.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/norms/forty-yd.test.ts`

Expected: FAIL — `isFortyYardMphPrimary("20yd_Dash", "10-20yd")` is `false`.

**Step 3: Write minimal implementation**

In `src/lib/norms/editor-metrics.ts` add:

```ts
export const TWENTY_YD_DASH = "20yd_Dash";
```

In `src/lib/norms/forty-yd.ts`, import `TWENTY_YD_DASH` and extend the two predicates (keep export names so `LeaderboardClient` keeps working):

```ts
export function isFortyYardMphPrimary(
  metricKey: string,
  component: string | null | undefined
): boolean {
  if (metricKey === FORTY_YD_DASH) return component === "20-40yd";
  if (metricKey === TWENTY_YD_DASH) return component === "10-20yd";
  return false;
}

export function showFortyYardMphSecondary(
  metricKey: string,
  component: string | null | undefined
): boolean {
  if (metricKey === FORTY_YD_DASH) {
    if (component === "0-40yd") return false;
    return yardsInFortyComponent(component) != null;
  }
  if (metricKey === TWENTY_YD_DASH) {
    if (component === "0-20yd") return false;
    return yardsInFortyComponent(component) != null;
  }
  return false;
}
```

`fortyYardLiveReadout` already calls those two functions — no further change. `LeaderboardClient` already calls `fortyYardLiveReadout` / `isFortyYardMphPrimary` with the active metric key.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/norms/forty-yd.test.ts`

Expected: PASS (including existing 40yd cases).

**Step 5: Commit**

```bash
git add src/lib/norms/forty-yd.ts src/lib/norms/forty-yd.test.ts src/lib/norms/editor-metrics.ts
git commit -m "feat: show 20yd split mph like 40yd, with 10-20yd primary"
```

---

### Task 3: `5-10-5_Agility` registry and `sided_optional` parse

**Files:**
- Modify: `src/lib/metrics.json` (after `5-0-10_Agility`)
- Modify: `src/lib/parser.ts`
- Modify: `src/lib/parser.test.ts`

**Step 1: Write the failing test**

Append to `src/lib/parser.test.ts`:

```ts
describe("5-10-5_Agility", () => {
  it("stores one time as Athlete-Comfort", () => {
    const rows = parseEntry("5-10-5_Agility", "4.52");
    expect(rows).toEqual([
      {
        metric_key: "5-10-5_Agility",
        interval_index: null,
        component: "Athlete-Comfort",
        value: 4.52,
        display_value: 4.52,
        units: "s",
      },
    ]);
  });

  it("stores two times as L, R, and Average", () => {
    const rows = parseEntry("5-10-5_Agility", "4.48|4.56");
    expect(rows.map((r) => r.component)).toEqual(["L", "R", "Average"]);
    expect(rows[0]).toMatchObject({ component: "L", value: 4.48, units: "s" });
    expect(rows[1]).toMatchObject({ component: "R", value: 4.56, units: "s" });
    expect(rows[2]).toMatchObject({
      component: "Average",
      value: 4.52,
      display_value: 4.52,
      units: "s",
    });
  });

  it("does not emit an L-R percent row", () => {
    const rows = parseEntry("5-10-5_Agility", "4.48|4.56");
    expect(rows.some((r) => r.component === "L-R")).toBe(false);
  });

  it("rejects three values", () => {
    expect(() => parseEntry("5-10-5_Agility", "4.48|4.56|4.60")).toThrow(
      /1 or 2/
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/parser.test.ts`

Expected: FAIL — `Unknown metric: 5-10-5_Agility`.

**Step 3: Write minimal implementation**

Add to `src/lib/metrics.json` after `5-0-10_Agility`:

```json
  "5-10-5_Agility": {
    "display_name": "5-10-5_Agility",
    "category": "Speed",
    "subcategory": "Agility",
    "input_units": "s",
    "display_units": "s",
    "conversion_formula": "",
    "input_structure": "sided_optional",
    "default_splits": ["L", "R"]
  },
```

In `src/lib/parser.ts`:

1. Extend `MetricDef.input_structure`:

```ts
input_structure:
  | "single_interval"
  | "cumulative"
  | "paired_components"
  | "sided_optional";
```

2. In `parseEntry`, after the `paired_components` branch:

```ts
  if (inputStructure === "sided_optional") {
    return parseSidedOptional(metric, rawInput.trim());
  }
```

3. Add:

```ts
function parseSidedOptional(metric: MetricDef, rawInput: string): ParsedEntry[] {
  const parts = splitValues(rawInput);
  const values = parts.map((p) => {
    const v = parseFloat(p);
    if (Number.isNaN(v)) throw new Error(`Cannot parse component value "${p}"`);
    return v;
  });

  if (values.length === 1) {
    return [
      {
        metric_key: metric.display_name,
        interval_index: null,
        component: "Athlete-Comfort",
        value: values[0],
        display_value: applyConversion(values[0], metric.conversion_formula),
        units: metric.display_units,
      },
    ];
  }

  if (values.length === 2) {
    const [left, right] = values;
    const average = (left + right) / 2;
    const sides = [
      { component: "L", value: left },
      { component: "R", value: right },
      { component: "Average", value: average },
    ];
    return sides.map((side) => ({
      metric_key: metric.display_name,
      interval_index: null,
      component: side.component,
      value: side.value,
      display_value: applyConversion(side.value, metric.conversion_formula),
      units: metric.display_units,
    }));
  }

  throw new Error(
    `${metric.display_name} expects 1 or 2 times, got ${values.length}`
  );
}
```

Do **not** call `parsePairedComponents`. Do **not** emit `L-R`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/parser.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/metrics.json src/lib/parser.ts src/lib/parser.test.ts
git commit -m "feat: parse 5-10-5_Agility as one comfort side or L/R plus average"
```

---

### Task 4: `isPrimaryResultComponent` helper

This is the overall-result rule used by PRs, flags, testing-day, historical, and live overall.

**Files:**
- Modify: `src/lib/metric-utils.ts`
- Modify: `src/lib/metric-utils.test.ts`

**Step 1: Write the failing test**

Append to `src/lib/metric-utils.test.ts`:

```ts
import { isPrimaryResultComponent } from "./metric-utils";

describe("isPrimaryResultComponent", () => {
  it("treats Average and Athlete-Comfort as 5-10-5 overall", () => {
    expect(isPrimaryResultComponent("5-10-5_Agility", "Average")).toBe(true);
    expect(isPrimaryResultComponent("5-10-5_Agility", "Athlete-Comfort")).toBe(
      true
    );
    expect(isPrimaryResultComponent("5-10-5_Agility", "L")).toBe(false);
    expect(isPrimaryResultComponent("5-10-5_Agility", "R")).toBe(false);
    expect(isPrimaryResultComponent("5-10-5_Agility", null)).toBe(false);
  });

  it("uses the cumulative full-run component", () => {
    expect(isPrimaryResultComponent("20yd_Dash", "0-20yd")).toBe(true);
    expect(isPrimaryResultComponent("20yd_Dash", "0-10yd")).toBe(false);
    expect(isPrimaryResultComponent("40yd_Dash", "0-40yd")).toBe(true);
    expect(isPrimaryResultComponent("20m_Accel", "0-20m")).toBe(true);
  });

  it("treats empty component as overall for single-interval metrics", () => {
    expect(isPrimaryResultComponent("Vertical Jump", null)).toBe(true);
    expect(isPrimaryResultComponent("Vertical Jump", "")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/metric-utils.test.ts`

Expected: FAIL — `isPrimaryResultComponent` is not exported.

**Step 3: Write minimal implementation**

In `src/lib/metric-utils.ts`:

```ts
export const AGILITY_5105 = "5-10-5_Agility";

export const AGILITY_5105_PRIMARY_COMPONENTS = [
  "Average",
  "Athlete-Comfort",
] as const;

export function isAgility5105PrimaryComponent(
  component: string | null | undefined
): boolean {
  return (
    component === "Average" || component === "Athlete-Comfort"
  );
}

export function isPrimaryResultComponent(
  metricKey: string,
  component: string | null | undefined,
  registry?: MetricRegistry
): boolean {
  if (metricKey === AGILITY_5105) {
    return isAgility5105PrimaryComponent(component);
  }
  const primary = getPrimaryComponent(metricKey, registry);
  if (primary == null) {
    return component == null || component === "";
  }
  return component === primary || component == null || component === "";
}
```

Keep existing `getPrimaryComponent` behavior (5-10-5 stays `null` because it is not cumulative).

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/metric-utils.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/metric-utils.ts src/lib/metric-utils.test.ts
git commit -m "feat: match 5-10-5 overall to Average or Athlete-Comfort"
```

---

### Task 5: Sport-defaults list, 20yd/5-10-5 cut components

**Files:**
- Modify: `src/lib/norms/editor-metrics.ts`
- Modify: `src/lib/norms/editor-metrics.test.ts`

**Step 1: Write the failing test**

Replace/extend `src/lib/norms/editor-metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  defaultCutsComponent,
  NORMS_DEFAULTS_METRIC_KEYS,
  TWENTY_YD_COMPONENTS,
  AGILITY_5105_CUT_COMPONENTS,
} from "./editor-metrics";

describe("NORMS_DEFAULTS_METRIC_KEYS", () => {
  it("includes 20yd_Dash and 5-10-5_Agility next to the existing intake tests", () => {
    expect(NORMS_DEFAULTS_METRIC_KEYS).toEqual([
      "Vertical Jump",
      "Standing-Broad",
      "40yd_Dash",
      "20yd_Dash",
      "5-10-5_Agility",
      "OH-MB_Throw",
      "UH-MB_Throw",
    ]);
  });
});

describe("defaultCutsComponent", () => {
  it("defaults 40yd_Dash to 0-40yd so named parsed rows can match cuts", () => {
    expect(defaultCutsComponent("40yd_Dash")).toBe("0-40yd");
  });

  it("defaults 20yd_Dash to 0-20yd", () => {
    expect(defaultCutsComponent("20yd_Dash")).toBe("0-20yd");
  });

  it("keeps 5-10-5 overall empty so Average and Athlete-Comfort share the sport cut", () => {
    expect(defaultCutsComponent("5-10-5_Agility")).toBe("");
  });

  it("keeps other metrics empty/none", () => {
    expect(defaultCutsComponent("Vertical Jump")).toBe("");
    expect(defaultCutsComponent("Standing-Broad")).toBe("");
    expect(defaultCutsComponent("OH-MB_Throw")).toBe("");
  });
});

describe("named cut components", () => {
  it("lists 20yd split windows", () => {
    expect(TWENTY_YD_COMPONENTS).toEqual([
      "0-5yd",
      "0-10yd",
      "0-20yd",
      "5-10yd",
      "10-20yd",
    ]);
  });

  it("lists 5-10-5 side extras (Overall is empty string, not in this list)", () => {
    expect(AGILITY_5105_CUT_COMPONENTS).toEqual(["L", "R"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/norms/editor-metrics.test.ts`

Expected: FAIL — keys missing from `NORMS_DEFAULTS_METRIC_KEYS`.

**Step 3: Write minimal implementation**

In `src/lib/norms/editor-metrics.ts`:

```ts
export const NORMS_DEFAULTS_METRIC_KEYS = [
  "Vertical Jump",
  "Standing-Broad",
  "40yd_Dash",
  "20yd_Dash",
  "5-10-5_Agility",
  "OH-MB_Throw",
  "UH-MB_Throw",
] as const;

export const TWENTY_YD_DASH = "20yd_Dash"; // already added in Task 2; do not duplicate

export const TWENTY_YD_PRIMARY_COMPONENT = "0-20yd";

export const TWENTY_YD_COMPONENTS = [
  "0-5yd",
  "0-10yd",
  "0-20yd",
  "5-10yd",
  "10-20yd",
] as const;

export const AGILITY_5105 = "5-10-5_Agility";

export const AGILITY_5105_CUT_COMPONENTS = ["L", "R"] as const;

export function defaultCutsComponent(metric: string): string {
  if (metric === FORTY_YD_DASH) return FORTY_YD_PRIMARY_COMPONENT;
  if (metric === TWENTY_YD_DASH) return TWENTY_YD_PRIMARY_COMPONENT;
  return "";
}
```

If `TWENTY_YD_DASH` already exists from Task 2, only add the new constants and update `defaultCutsComponent` / `NORMS_DEFAULTS_METRIC_KEYS`. Re-export `AGILITY_5105` from editor-metrics only if needed by the editor; `metric-utils` remains the matching source of truth.

`cutsEditorMetrics()` already prepends `NORMS_DEFAULTS_METRIC_KEYS`, so both new metrics appear in the cuts metric dropdown without extra filters (`sided_optional` / `cumulative` would otherwise be excluded from the single_interval extras).

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/norms/editor-metrics.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/norms/editor-metrics.ts src/lib/norms/editor-metrics.test.ts
git commit -m "feat: add 20yd and 5-10-5 to sport-default norms tests"
```

---

### Task 6: Testing-day overall matching and named components

**Files:**
- Modify: `src/lib/norms/testing-day.ts`
- Modify: `src/lib/norms/testing-day.test.ts`

**Step 1: Write the failing tests**

Append to `src/lib/norms/testing-day.test.ts`:

```ts
describe("5-10-5 and 20yd testing-day components", () => {
  it("resolves empty 20yd component to 0-20yd", () => {
    expect(resolveTestingDayComponent("20yd_Dash", null)).toBe("0-20yd");
    expect(resolveTestingDayComponent("20yd_Dash", "")).toBe("0-20yd");
  });

  it("keeps empty 5-10-5 component as overall (null)", () => {
    expect(resolveTestingDayComponent("5-10-5_Agility", null)).toBeNull();
  });

  it("matches Average or Athlete-Comfort when 5-10-5 overall is selected", () => {
    expect(
      entryMatchesTestingDayComponent(
        { component: "Average", interval_index: null },
        null,
        "5-10-5_Agility"
      )
    ).toBe(true);
    expect(
      entryMatchesTestingDayComponent(
        { component: "Athlete-Comfort", interval_index: null },
        null,
        "5-10-5_Agility"
      )
    ).toBe(true);
    expect(
      entryMatchesTestingDayComponent(
        { component: "L", interval_index: null },
        null,
        "5-10-5_Agility"
      )
    ).toBe(false);
  });

  it("still matches Vertical Jump overall as null-component rows", () => {
    expect(
      entryMatchesTestingDayComponent(
        { component: null, interval_index: null },
        null,
        "Vertical Jump"
      )
    ).toBe(true);
  });

  it("falls back to 20yd named windows", () => {
    expect(testingDayNamedComponents("20yd_Dash", [])).toEqual([
      "0-5yd",
      "0-10yd",
      "0-20yd",
      "5-10yd",
      "10-20yd",
    ]);
  });

  it("falls back to 5-10-5 L and R (Overall is the empty default)", () => {
    expect(testingDayNamedComponents("5-10-5_Agility", [])).toEqual(["L", "R"]);
  });
});
```

Update the existing `entryMatchesTestingDayComponent` tests to pass the optional third arg (or keep it optional with default `""` / unused). Existing two-arg calls must keep working: when `metricKey` is omitted, behavior stays as today.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/norms/testing-day.test.ts`

Expected: FAIL — `entryMatchesTestingDayComponent` does not treat Average as overall.

**Step 3: Write minimal implementation**

In `src/lib/norms/testing-day.ts`:

- Import `TWENTY_YD_DASH`, `TWENTY_YD_COMPONENTS`, `AGILITY_5105`, `AGILITY_5105_CUT_COMPONENTS` from `editor-metrics`.
- Import `isPrimaryResultComponent` from `metric-utils`.

```ts
export function entryMatchesTestingDayComponent(
  row: { component: string | null; interval_index: number | null },
  resolvedComponent: string | null,
  metricKey?: string
): boolean {
  if (resolvedComponent == null) {
    if (metricKey && isPrimaryResultComponent(metricKey, row.component)) {
      return row.interval_index == null;
    }
    return (
      row.interval_index == null &&
      (row.component == null || row.component === "")
    );
  }
  return row.component === resolvedComponent;
}
```

Careful: `isPrimaryResultComponent("Vertical Jump", null)` is `true`, so the new branch for VJ with `metricKey` passed is equivalent to the old null-component check. For 5-10-5, Average/Athlete-Comfort match. For 20yd, `resolveTestingDayComponent` returns `0-20yd` (not null), so the named-equality branch applies.

Update `testingDayNamedComponents` fallback:

```ts
  if (named.length > 0) return named;
  if (metricKey === "40yd_Dash") return [...FORTY_YARD_COMPONENTS];
  if (metricKey === TWENTY_YD_DASH) return [...TWENTY_YD_COMPONENTS];
  if (metricKey === AGILITY_5105) return [...AGILITY_5105_CUT_COMPONENTS];
  const primary = getPrimaryComponent(metricKey);
  return primary ? [primary] : [];
```

Find the testing-day API/route call site of `entryMatchesTestingDayComponent` and pass `metricKey`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/norms/testing-day.test.ts`

Expected: PASS. Also run `npm test -- src/lib/norms/testing-day.test.ts` after wiring the route call if it lives in `src/app/api/reporting/testing-day/route.ts`.

**Step 5: Commit**

```bash
git add src/lib/norms/testing-day.ts src/lib/norms/testing-day.test.ts src/app/api/reporting/testing-day/route.ts
git commit -m "feat: score 5-10-5 and 20yd overall on testing day"
```

---

### Task 7: Historical overall filter for 5-10-5 and 20yd

**Files:**
- Modify: `src/lib/historical-metric-filter.ts`
- Modify: `src/lib/historical-metric-filter.test.ts`
- Modify: `src/app/api/leaderboard/historical/route.ts` (SQL allowed-components branch)

**Step 1: Write the failing test**

Append to `src/lib/historical-metric-filter.test.ts`:

```ts
  it("returns 0-20yd primary for 20yd_Dash", () => {
    expect(getHistoricalComponentFilter("20yd_Dash")).toEqual({
      primary: "0-20yd",
      allowNullComponent: true,
      allowedComponents: null,
    });
  });

  it("restricts 5-10-5 to Average and Athlete-Comfort", () => {
    expect(getHistoricalComponentFilter("5-10-5_Agility")).toEqual({
      primary: null,
      allowNullComponent: false,
      allowedComponents: ["Average", "Athlete-Comfort"],
    });
  });
```

Update existing assertions that compare the whole object so they include `allowedComponents: null`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/historical-metric-filter.test.ts`

Expected: FAIL — extra field / 5-10-5 not restricted.

**Step 3: Write minimal implementation**

```ts
import { getPrimaryComponent } from "./metric-utils";
import {
  AGILITY_5105,
  AGILITY_5105_PRIMARY_COMPONENTS,
} from "./metric-utils";
import { getMetricsRegistry } from "./parser";

export type HistoricalComponentFilter = {
  primary: string | null;
  allowNullComponent: boolean;
  allowedComponents: string[] | null;
};

export function getHistoricalComponentFilter(
  metricKey: string
): HistoricalComponentFilter {
  if (metricKey === AGILITY_5105) {
    return {
      primary: null,
      allowNullComponent: false,
      allowedComponents: [...AGILITY_5105_PRIMARY_COMPONENTS],
    };
  }
  const registry = getMetricsRegistry();
  const primary = getPrimaryComponent(metricKey, registry);
  if (primary == null) {
    return { primary: null, allowNullComponent: false, allowedComponents: null };
  }
  return { primary, allowNullComponent: true, allowedComponents: null };
}
```

In `historical/route.ts`, wrap the existing component predicate (both ASC and DESC queries):

```sql
AND (
  (
    ${filter.allowedComponents}::text[] IS NOT NULL
    AND e.component = ANY(${filter.allowedComponents}::text[])
  )
  OR (
    ${filter.allowedComponents}::text[] IS NULL
    AND (
      ${filter.primary}::text IS NULL
      OR e.component = ${filter.primary}
      OR (${filter.allowNullComponent} AND e.component IS NULL)
    )
  )
)
```

If `sql` tagged templates dislike `text[] IS NOT NULL` on a JS array, pass a boolean instead:

```ts
const restrictToAllowed = filter.allowedComponents != null;
const allowed = filter.allowedComponents ?? [];
```

```sql
AND (
  (
    ${restrictToAllowed}::boolean = true
    AND e.component = ANY(${allowed})
  )
  OR (
    ${restrictToAllowed}::boolean = false
    AND (
      ${filter.primary}::text IS NULL
      OR e.component = ${filter.primary}
      OR (${filter.allowNullComponent} AND e.component IS NULL)
    )
  )
)
```

20yd uses `primary: "0-20yd"` so it follows the existing 40yd path. Zones: historical already passes `component: filter.primary` into attach-zones (see existing 40yd test). 5-10-5 overall cuts are empty-component → pass `component: null` when `allowedComponents` is set.

Find `attachCurrentStickZones({ component: filter.primary })` and use:

```ts
component: filter.allowedComponents ? null : filter.primary,
```

so 5-10-5 overall rows badge against the empty/overall cut.

**Step 4: Run tests**

Run: `npm test -- src/lib/historical-metric-filter.test.ts src/app/api/leaderboard/historical/route.test.ts`

Expected: PASS. If the historical route test cannot hit Postgres, the filter unit tests plus a comment at the SQL site are the contract; do not skip the SQL edit.

**Step 5: Commit**

```bash
git add src/lib/historical-metric-filter.ts src/lib/historical-metric-filter.test.ts src/app/api/leaderboard/historical/route.ts
git commit -m "feat: historical overall for 20yd and 5-10-5 primary sides"
```

---

### Task 8: PRs, flags, team-overview, progression use primary helper

**Files:**
- Modify: `src/app/api/athletes/[id]/prs/route.ts`
- Modify: `src/app/api/athletes/[id]/flags/route.ts`
- Modify: `src/app/api/team-overview/route.ts`
- Modify: `src/app/api/progression/route.ts`

These routes currently skip non-primary rows only when `getPrimaryComponent` is non-null. That would treat 5-10-5 L/R as PRs (min of all sides). Replace with `isPrimaryResultComponent`.

**Step 1: No new route-level tests** (they need DB). The helper is already tested. Change the keep/skip predicate only.

**Step 2: Implement**

PRs (`prs/route.ts`) replace:

```ts
const primary = getPrimaryComponent(r.metric_key, registry);
const keep =
  primary == null || r.component === primary || r.component == null;
```

with:

```ts
const keep = isPrimaryResultComponent(r.metric_key, r.component, registry);
```

Flags / team-overview replace:

```ts
const primary = getPrimaryComponent(r.metric_key, registry);
if (primary != null && r.component != null && r.component !== primary) {
  continue;
}
```

with:

```ts
if (!isPrimaryResultComponent(r.metric_key, r.component, registry)) {
  continue;
}
```

Progression: where it currently `AND e.component = ${primary}` after `getPrimaryComponent`, for 5-10-5 `primary` is null so the unfiltered branch would include L/R. After the unknown-metric check:

```ts
if (metric === AGILITY_5105) {
  // same query shape as the primary branch, but
  // AND e.component IN ('Average', 'Athlete-Comfort')
}
```

or always use `isPrimaryResultComponent` in JS if that query already fetches then aggregates. Prefer one SQL `IN` for 5-10-5 rather than loading extra rows. Keep the existing `component = primary` branch for cumulatives (20yd will automatically use `0-20yd` once the metric exists).

**Step 3: Run** `npm test -- src/lib/metric-utils.test.ts`

Expected: PASS. Typecheck the four routes (`npx tsc --noEmit` if that is the project check; otherwise rely on `npm test` + editor diagnostics).

**Step 4: Commit**

```bash
git add src/app/api/athletes/[id]/prs/route.ts src/app/api/athletes/[id]/flags/route.ts src/app/api/team-overview/route.ts src/app/api/progression/route.ts
git commit -m "fix: keep 5-10-5 PRs and flags on Average or Athlete-Comfort"
```

---

### Task 9: Live leaderboard overall SQL + session Overall chip

Live `overallOnly` currently requires `e.component IS NULL`. 5-10-5 overall rows are named `Average` / `Athlete-Comfort`, so they would never rank unless the SQL grows. Session-metrics only emits an "Overall" chip when a null-component pair exists.

**Files:**
- Modify: `src/lib/metric-utils.ts` (+ test)
- Modify: `src/app/api/leaderboard/route.ts`
- Modify: `src/app/api/leaderboard/session-metrics/route.ts`

**Step 1: Write the failing test**

In `src/lib/metric-utils.test.ts`:

```ts
describe("liveOverallEntry", () => {
  it("treats 5-10-5 Average and Athlete-Comfort as overall", () => {
    expect(isLiveOverallEntry("5-10-5_Agility", null, "Average")).toBe(true);
    expect(
      isLiveOverallEntry("5-10-5_Agility", null, "Athlete-Comfort")
    ).toBe(true);
    expect(isLiveOverallEntry("5-10-5_Agility", null, "L")).toBe(false);
    expect(isLiveOverallEntry("5-10-5_Agility", 0, "Average")).toBe(false);
  });

  it("treats null-component rows as overall for other metrics", () => {
    expect(isLiveOverallEntry("Vertical Jump", null, null)).toBe(true);
    expect(isLiveOverallEntry("Vertical Jump", null, "x")).toBe(false);
  });
});

describe("sessionHasOverallChip", () => {
  it("adds Overall when 5-10-5 has a primary side", () => {
    expect(
      sessionHasOverallChip("5-10-5_Agility", [
        { interval_index: null, component: "Athlete-Comfort" },
      ])
    ).toBe(true);
  });

  it("does not invent Overall for 40yd named splits", () => {
    expect(
      sessionHasOverallChip("40yd_Dash", [
        { interval_index: 2, component: "0-40yd" },
      ])
    ).toBe(false);
  });
});
```

**Step 2: Run to verify fail**

Run: `npm test -- src/lib/metric-utils.test.ts`

Expected: FAIL — functions missing.

**Step 3: Implement helpers**

```ts
export function isLiveOverallEntry(
  metricKey: string,
  intervalIndex: number | null,
  component: string | null
): boolean {
  if (intervalIndex != null) return false;
  if (metricKey === AGILITY_5105) {
    return isAgility5105PrimaryComponent(component);
  }
  return component == null || component === "";
}

export function sessionHasOverallChip(
  metricKey: string,
  pairs: { interval_index: number | null; component: string | null }[]
): boolean {
  if (metricKey === AGILITY_5105) {
    return pairs.some((p) => isAgility5105PrimaryComponent(p.component));
  }
  return pairs.some(
    (p) => p.interval_index == null && (p.component == null || p.component === "")
  );
}
```

In `session-metrics/route.ts` replace `hasOverall` with `sessionHasOverallChip(metric_key, pairs)`.

In `leaderboard/route.ts`, every overallOnly clause currently:

```sql
(${overallOnly}::boolean = true AND e.interval_index IS NULL AND e.component IS NULL)
```

becomes:

```sql
(
  ${overallOnly}::boolean = true
  AND e.interval_index IS NULL
  AND (
    e.component IS NULL
    OR (
      ${metric}::text = '5-10-5_Agility'
      AND e.component IN ('Average', 'Athlete-Comfort')
    )
  )
)
```

Replace **all** copies in that file (units probe, ranks, PB/SB, previous session). Do not change the `overallOnly = false` named-component branch. `applyLeaderboardZones` already gets `component: null` for overall — 5-10-5 sport cuts are empty-component, so badges still attach.

**Step 4: Run tests**

Run: `npm test -- src/lib/metric-utils.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/metric-utils.ts src/lib/metric-utils.test.ts src/app/api/leaderboard/route.ts src/app/api/leaderboard/session-metrics/route.ts
git commit -m "feat: live overall board for 5-10-5 Average and Athlete-Comfort"
```

---

### Task 10: Norms editor component pickers

**Files:**
- Modify: `src/app/norms/NormsEditor.tsx`

**Step 1: No component unit test file exists.** Behavior is the design: 20yd shows split dropdown (default `0-20yd`); 5-10-5 shows Overall / L / R (default Overall `""`).

**Step 2: Implement**

Import `TWENTY_YD_DASH`, `TWENTY_YD_COMPONENTS`, `AGILITY_5105`, `AGILITY_5105_CUT_COMPONENTS`.

When the metric changes (`onMetricKey`):

```ts
setCutComponent(defaultCutsComponent(key));
```

(`defaultCutsComponent` already returns `0-40yd` / `0-20yd` / `""`.)

In `CutsPane`, replace `const showComponent = metricKey === FORTY_YD_DASH` with:

```ts
const forty = metricKey === FORTY_YD_DASH;
const twenty = metricKey === TWENTY_YD_DASH;
const agility = metricKey === AGILITY_5105;
const showComponent = forty || twenty || agility;
const componentOptions = forty
  ? FORTY_YD_COMPONENTS
  : twenty
    ? TWENTY_YD_COMPONENTS
    : agility
      ? AGILITY_5105_CUT_COMPONENTS
      : [];
```

Render:

```tsx
<option value="">
  {agility ? "Overall (Average or Athlete-Comfort)" : "(none)"}
</option>
{componentOptions.map((c) => (
  <option key={c} value={c}>{c}</option>
))}
```

Keep `sliceKey` using `showComponent ? component : ""` so 20yd/5-10-5 slices reload when the component changes.

**Step 3: Sanity** — `cutsEditorMetrics()` already lists the new keys via Task 5. Defaults pane already maps `NORMS_DEFAULTS_METRIC_KEYS`.

**Step 4: Commit**

```bash
git add src/app/norms/NormsEditor.tsx
git commit -m "feat: norms editor splits for 20yd and 5-10-5 sides"
```

---

### Task 11: Data-entry hints

**Files:**
- Modify: `src/app/data-entry/EntryForm.tsx`
- Modify: `src/app/data-entry/SessionForm.tsx`
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`

**Step 1:** No dedicated test. Add the hint strings from the design.

**Step 2: Implement**

`EntryForm` `inputHint`: after `paired_components`:

```ts
  if (metric.inputStructure === "sided_optional") {
    return `e.g. 4.52 (Athlete-Comfort) or 4.48|4.56 (L|R, ${metric.inputUnits})`;
  }
```

`SessionForm` and `EditSessionClient`, after the 40yd yards note:

```tsx
<p className="mb-2 text-xs text-foreground-muted">
  For 20yd, distances are yards: <code className="font-mono">10</code> for a
  10yd-only mark, or <code className="font-mono">5,5,10</code> for a full 20.
</p>
```

20yd already appears in `splitConfigMetrics` because `input_structure === "cumulative"`. No session UI for 5-10-5 sides.

**Step 3: Commit**

```bash
git add src/app/data-entry/EntryForm.tsx src/app/data-entry/SessionForm.tsx src/app/data-entry/session/[id]/EditSessionClient.tsx
git commit -m "feat: entry hints for 5-10-5 sides and 20yd yard splits"
```

---

### Task 12: Full test run

**Step 1:** Run: `npm test`

Expected: all green. If anything failed because `entryMatchesTestingDayComponent` gained a third argument, update call sites.

**Step 2:** Confirm `scripts/validate-data.ts` still only flags ISO `paired_components` (L/R). `sided_optional` must not go through that check (Average / Athlete-Comfort would look invalid). No change unless you accidentally used `paired_components` for 5-10-5.

**Step 3: Commit** only if Task 12 required extra call-site fixes.

---

## Execution notes

- TDD: every production change in Tasks 1–7 and 9 starts with a failing test. Tasks 8, 10, 11 wire already-tested helpers or copy.
- Weight-room `FORTY_YD_DASH` split pickers stay 40yd-only.
- `getPrimaryComponent("20yd_Dash")` is `"0-20yd"` from default splits; do not hardcode it in `getPrimaryComponent`.
- Live mph: keep `fortyYardLiveReadout` export name; `LeaderboardClient` needs no metric-key fork beyond the helper.
