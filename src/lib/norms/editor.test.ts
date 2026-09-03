import { describe, it, expect } from "vitest";
import {
  assertCanArchivePopulation,
  normalizeComponent,
  parsePopulationCreateBody,
  parsePopulationPatchBody,
  parseSportDefaultPut,
  parseThresholdCells,
  parseThresholdSliceReplace,
  uniqueCutsPerGender,
} from "./editor";

describe("normalizeComponent", () => {
  it("stores empty string as null", () => {
    expect(normalizeComponent("")).toBeNull();
    expect(normalizeComponent("  ")).toBeNull();
    expect(normalizeComponent(null)).toBeNull();
    expect(normalizeComponent(undefined)).toBeNull();
  });

  it("keeps a real split label", () => {
    expect(normalizeComponent("0-40yd")).toBe("0-40yd");
    expect(normalizeComponent(" 0-10yd ")).toBe("0-10yd");
  });
});

describe("uniqueCutsPerGender", () => {
  it("rejects two labels sharing the same cut for M", () => {
    const result = uniqueCutsPerGender([
      { gender: "M", label: "efficient", threshold: 5.0 },
      { gender: "M", label: "elite", threshold: 5.0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unique|same|duplicate/i);
    }
  });

  it("rejects two labels sharing the same cut for F", () => {
    const result = uniqueCutsPerGender([
      { gender: "F", label: "efficient", threshold: 20 },
      { gender: "F", label: "elite", threshold: 20 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("allows the same threshold on M and F", () => {
    const result = uniqueCutsPerGender([
      { gender: "M", label: "elite", threshold: 28 },
      { gender: "F", label: "elite", threshold: 28 },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("allows different cuts for the same gender", () => {
    const result = uniqueCutsPerGender([
      { gender: "M", label: "efficient", threshold: 5.0 },
      { gender: "M", label: "elite", threshold: 4.5 },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("rejects duplicate labels for the same gender", () => {
    const result = uniqueCutsPerGender([
      { gender: "M", label: "elite", threshold: 4.5 },
      { gender: "M", label: "elite", threshold: 4.4 },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("parseThresholdCells", () => {
  it("accepts an empty list (clears the slice)", () => {
    expect(parseThresholdCells([])).toEqual({ ok: true, value: [] });
  });

  it("accepts filled M/F palette cells with finite numbers", () => {
    const result = parseThresholdCells([
      { gender: "F", label: "efficient", threshold: 20 },
      { gender: "M", label: "elite", threshold: "4.5" },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        { gender: "F", label: "efficient", threshold: 20 },
        { gender: "M", label: "elite", threshold: 4.5 },
      ],
    });
  });

  it("rejects gender other than M or F", () => {
    const result = parseThresholdCells([
      { gender: "X", label: "elite", threshold: 4.5 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects labels outside the palette", () => {
    const result = parseThresholdCells([
      { gender: "M", label: "Efficient", threshold: 5 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects non-finite thresholds", () => {
    expect(
      parseThresholdCells([{ gender: "M", label: "elite", threshold: Number.NaN }])
        .ok
    ).toBe(false);
    expect(
      parseThresholdCells([
        { gender: "M", label: "elite", threshold: Number.POSITIVE_INFINITY },
      ]).ok
    ).toBe(false);
    expect(
      parseThresholdCells([{ gender: "M", label: "elite", threshold: "nope" }])
        .ok
    ).toBe(false);
  });

  it("rejects unique-cut violations", () => {
    const result = parseThresholdCells([
      { gender: "M", label: "efficient", threshold: 5 },
      { gender: "M", label: "elite", threshold: 5 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-array", () => {
    expect(parseThresholdCells({ gender: "M" }).ok).toBe(false);
  });
});

describe("parseThresholdSliceReplace", () => {
  it("normalizes empty component to null and keeps filled cells", () => {
    const result = parseThresholdSliceReplace({
      population_id: "11111111-1111-4111-8111-111111111111",
      metric_key: "Vertical Jump",
      component: "",
      cells: [{ gender: "F", label: "efficient", threshold: 20 }],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        population_id: "11111111-1111-4111-8111-111111111111",
        metric_key: "Vertical Jump",
        component: null,
        cells: [{ gender: "F", label: "efficient", threshold: 20 }],
      },
    });
  });

  it("rejects an unknown metric_key", () => {
    const result = parseThresholdSliceReplace({
      population_id: "11111111-1111-4111-8111-111111111111",
      metric_key: "not-a-metric",
      cells: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/metric/i);
  });

  it("rejects a missing population_id", () => {
    const result = parseThresholdSliceReplace({
      metric_key: "Vertical Jump",
      cells: [],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts synthetic MaxVelocity with an empty component", () => {
    const result = parseThresholdSliceReplace({
      population_id: "11111111-1111-4111-8111-111111111111",
      metric_key: "MaxVelocity",
      component: "",
      cells: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metric_key).toBe("MaxVelocity");
      expect(result.value.component).toBeNull();
    }
  });
});

describe("assertCanArchivePopulation", () => {
  it("blocks archive while sport defaults still point here", () => {
    const result = assertCanArchivePopulation(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/default/i);
    }
  });

  it("allows archive when nothing points here", () => {
    expect(assertCanArchivePopulation(0)).toEqual({ ok: true });
  });
});

describe("parsePopulationCreateBody", () => {
  it("requires a non-empty name", () => {
    expect(parsePopulationCreateBody({}).ok).toBe(false);
    expect(parsePopulationCreateBody({ name: "  " }).ok).toBe(false);
  });

  it("trims name and optional notes", () => {
    expect(parsePopulationCreateBody({ name: "  HS VJ  ", notes: "  x  " })).toEqual({
      ok: true,
      value: { name: "HS VJ", notes: "x" },
    });
  });

  it("treats omitted notes as null", () => {
    expect(parsePopulationCreateBody({ name: "A" })).toEqual({
      ok: true,
      value: { name: "A", notes: null },
    });
  });
});

describe("parsePopulationPatchBody", () => {
  it("requires at least one of name, notes, archived", () => {
    expect(parsePopulationPatchBody({}).ok).toBe(false);
  });

  it("accepts archived boolean, rename, and notes", () => {
    expect(
      parsePopulationPatchBody({
        name: "New",
        notes: null,
        archived: true,
      })
    ).toEqual({
      ok: true,
      value: { name: "New", notes: null, archived: true },
    });
  });

  it("rejects a non-boolean archived flag", () => {
    expect(parsePopulationPatchBody({ archived: "yes" }).ok).toBe(false);
  });
});

describe("parseSportDefaultPut", () => {
  it("accepts a known hugo group, metric, and population id", () => {
    const result = parseSportDefaultPut({
      hugo_group: "football",
      metric_key: "40yd_Dash",
      population_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        hugo_group: "football",
        metric_key: "40yd_Dash",
        population_id: "22222222-2222-4222-8222-222222222222",
      },
    });
  });

  it("accepts population_id null to clear the default", () => {
    const result = parseSportDefaultPut({
      hugo_group: "xc",
      metric_key: "Vertical Jump",
      population_id: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.population_id).toBeNull();
  });

  it("rejects an unknown hugo_group", () => {
    const result = parseSportDefaultPut({
      hugo_group: "lacrosse",
      metric_key: "Vertical Jump",
      population_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/hugo_group/i);
  });

  it("rejects an unknown metric_key", () => {
    const result = parseSportDefaultPut({
      hugo_group: "soccer",
      metric_key: "not-a-metric",
      population_id: null,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts synthetic MaxVelocity as a known norms metric", () => {
    const result = parseSportDefaultPut({
      hugo_group: "football",
      metric_key: "MaxVelocity",
      population_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.ok).toBe(true);
  });
});
