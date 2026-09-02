import { describe, it, expect } from "vitest";
import {
  FORTY_YARD_COMPONENTS,
  buildTestingDayMatrix,
  entryMatchesTestingDayComponent,
  pickBestTestingDayHits,
  resolveTestingDayComponent,
  sortTestingDayMetricKeys,
  summarizeTestingDay,
  testingDayColumnKey,
  testingDayNamedComponents,
} from "./testing-day";
import type {
  AttachZonesDefault,
  AttachZonesMembership,
} from "./attach-zones";
import type { TestingDayHit } from "./testing-day";

const VJ_POP = "pop-vj";
const FORTY_POP = "pop-40";

const memberships: AttachZonesMembership[] = [
  { athlete_id: "vb", hugo_group: "volleyball", is_primary: true },
  { athlete_id: "fb", hugo_group: "football", is_primary: true },
  { athlete_id: "sc", hugo_group: "soccer", is_primary: true },
  { athlete_id: "xc", hugo_group: "xc", is_primary: false },
];

const defaults: AttachZonesDefault[] = [
  { hugo_group: "volleyball", metric_key: "Vertical Jump", population_id: VJ_POP },
  { hugo_group: "football", metric_key: "Vertical Jump", population_id: VJ_POP },
  { hugo_group: "football", metric_key: "40yd_Dash", population_id: FORTY_POP },
];

function hit(partial: Partial<TestingDayHit> & Pick<TestingDayHit, "athlete_id">): TestingDayHit {
  return {
    first_name: "A",
    last_name: partial.athlete_id.toUpperCase(),
    gender: "F",
    display_value: 22,
    ...partial,
  };
}

function groupOf(
  groups: ReturnType<typeof summarizeTestingDay>,
  sport: string | null,
  gender: "M" | "F" | null
) {
  return groups.find((g) => g.sport === sport && g.gender === gender);
}

function labelNames(group: NonNullable<ReturnType<typeof groupOf>>): string[] {
  return group.label_counts.map((c) => c.label);
}

describe("summarizeTestingDay mixed sports", () => {
  it("splits volleyball and football into separate sport+gender groups", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({
          athlete_id: "vb",
          first_name: "Val",
          last_name: "Ball",
          gender: "F",
          display_value: 22,
          zone_label: "efficient",
        }),
        hit({
          athlete_id: "fb",
          first_name: "Ford",
          last_name: "Ball",
          gender: "M",
          display_value: 4.5,
          zone_label: "elite",
        }),
      ],
      memberships,
      defaults,
      metricKey: "Vertical Jump",
    });

    expect(groups).toHaveLength(2);
    const vb = groupOf(groups, "volleyball", "F");
    const fb = groupOf(groups, "football", "M");
    expect(vb?.headcount).toBe(1);
    expect(vb?.has_standard).toBe(true);
    expect(vb?.label_counts).toEqual([{ label: "efficient", count: 1 }]);
    expect(fb?.headcount).toBe(1);
    expect(fb?.label_counts).toEqual([{ label: "elite", count: 1 }]);
  });
});

describe("summarizeTestingDay override", () => {
  it("keeps sport groups but treats every athlete as having a standard", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({
          athlete_id: "vb",
          gender: "M",
          display_value: 4.5,
          zone_label: "elite",
        }),
        hit({
          athlete_id: "sc",
          gender: "M",
          display_value: 4.5,
          zone_label: "elite",
        }),
      ],
      memberships,
      defaults,
      metricKey: "40yd_Dash",
      overridePopulationId: FORTY_POP,
    });

    const vb = groupOf(groups, "volleyball", "M");
    const sc = groupOf(groups, "soccer", "M");
    expect(vb?.has_standard).toBe(true);
    expect(sc?.has_standard).toBe(true);
    expect(vb?.label_counts).toEqual([{ label: "elite", count: 1 }]);
    expect(sc?.label_counts).toEqual([{ label: "elite", count: 1 }]);
    expect(vb?.efficient_plus).toBe(1);
    expect(sc?.efficient_plus).toBe(1);
  });
});

describe("summarizeTestingDay no primary sport", () => {
  it("marks no-standard and lists the athlete as unbadged", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({
          athlete_id: "xc",
          first_name: "No",
          last_name: "Primary",
          gender: "M",
          display_value: 22,
        }),
      ],
      memberships,
      defaults,
      metricKey: "Vertical Jump",
    });

    const g = groupOf(groups, null, "M");
    expect(g?.has_standard).toBe(false);
    expect(g?.headcount).toBe(1);
    expect(g?.label_counts).toEqual([]);
    expect(g?.efficient_plus).toBe(0);
    expect(g?.unbadged).toEqual([
      {
        athlete_id: "xc",
        first_name: "No",
        last_name: "Primary",
        display_value: 22,
      },
    ]);
  });
});

describe("summarizeTestingDay empty gender table", () => {
  it("keeps the sport standard but attaches no badge", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({
          athlete_id: "vb",
          first_name: "Val",
          last_name: "Ball",
          gender: "M",
          display_value: 22,
        }),
      ],
      memberships,
      defaults,
      metricKey: "Vertical Jump",
    });

    const g = groupOf(groups, "volleyball", "M");
    expect(g?.has_standard).toBe(true);
    expect(g?.label_counts).toEqual([]);
    expect(g?.efficient_plus).toBe(0);
    expect(g?.unbadged).toHaveLength(1);
    expect(g?.unbadged[0].athlete_id).toBe("vb");
  });
});

describe("summarizeTestingDay Efficient+", () => {
  it("excludes unbadged athletes from Efficient+", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({
          athlete_id: "vb",
          gender: "F",
          display_value: 22,
          zone_label: "efficient",
        }),
        hit({
          athlete_id: "vb2",
          first_name: "Below",
          last_name: "Cut",
          gender: "F",
          display_value: 18,
        }),
      ],
      memberships: [
        ...memberships,
        { athlete_id: "vb2", hugo_group: "volleyball", is_primary: true },
      ],
      defaults,
      metricKey: "Vertical Jump",
    });

    const g = groupOf(groups, "volleyball", "F");
    expect(g?.headcount).toBe(2);
    expect(g?.efficient_plus).toBe(1);
    expect(g?.unbadged).toHaveLength(1);
    expect(g?.unbadged[0].athlete_id).toBe("vb2");
  });

  it("counts advanced, elite, and world-class when the table has no efficient cut", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({ athlete_id: "p", gender: "F", zone_label: "poor", display_value: 12 }),
        hit({ athlete_id: "a", gender: "F", zone_label: "advanced", display_value: 24 }),
        hit({ athlete_id: "e", gender: "F", zone_label: "elite", display_value: 28 }),
        hit({ athlete_id: "w", gender: "F", zone_label: "world-class", display_value: 32 }),
      ],
      memberships: [
        { athlete_id: "p", hugo_group: "volleyball", is_primary: true },
        { athlete_id: "a", hugo_group: "volleyball", is_primary: true },
        { athlete_id: "e", hugo_group: "volleyball", is_primary: true },
        { athlete_id: "w", hugo_group: "volleyball", is_primary: true },
      ],
      defaults,
      metricKey: "Vertical Jump",
    });

    const g = groupOf(groups, "volleyball", "F");
    expect(g?.efficient_plus).toBe(3);
    expect(labelNames(g!)).toEqual(["poor", "advanced", "elite", "world-class"]);
  });
});

describe("summarizeTestingDay filled labels", () => {
  it("omits labels that nobody hit, including missing Poor", () => {
    const groups = summarizeTestingDay({
      rows: [
        hit({ athlete_id: "vb", gender: "F", zone_label: "efficient" }),
        hit({
          athlete_id: "vb2",
          gender: "F",
          zone_label: "elite",
          display_value: 28,
        }),
      ],
      memberships: [
        ...memberships,
        { athlete_id: "vb2", hugo_group: "volleyball", is_primary: true },
      ],
      defaults,
      metricKey: "Vertical Jump",
    });

    const g = groupOf(groups, "volleyball", "F");
    expect(labelNames(g!)).toEqual(["efficient", "elite"]);
    expect(g?.label_counts.find((c) => c.label === "poor")).toBeUndefined();
    expect(g?.label_counts.find((c) => c.label === "developmental")).toBeUndefined();
  });
});

describe("resolveTestingDayComponent", () => {
  it("defaults omitted component to the primary split for cumulatives", () => {
    expect(resolveTestingDayComponent("40m_Sprint", null)).toBe("0-40m");
    expect(resolveTestingDayComponent("40m_Sprint", "")).toBe("0-40m");
    expect(resolveTestingDayComponent("20m_Accel", undefined)).toBe("0-20m");
    expect(resolveTestingDayComponent("10m_Accel", "  ")).toBe("0-10m");
    expect(resolveTestingDayComponent("40yd_Dash", null)).toBe("0-40yd");
  });

  it("keeps null for single-interval metrics like Vertical Jump", () => {
    expect(resolveTestingDayComponent("Vertical Jump", null)).toBeNull();
    expect(resolveTestingDayComponent("Vertical Jump", "")).toBeNull();
  });

  it("respects an explicit named component", () => {
    expect(resolveTestingDayComponent("40m_Sprint", "0-10m")).toBe("0-10m");
    expect(resolveTestingDayComponent("40yd_Dash", "10-20yd")).toBe("10-20yd");
  });
});

describe("testingDayNamedComponents", () => {
  it("lists named session-metrics components and skips Overall", () => {
    expect(
      testingDayNamedComponents("40m_Sprint", [
        { component: null, label: "Overall" },
        { component: "0-10m", label: "0-10m" },
        { component: "0-40m", label: "0-40m" },
      ])
    ).toEqual(["0-10m", "0-40m"]);
  });

  it("returns empty when the session only has overall (Vertical Jump)", () => {
    expect(
      testingDayNamedComponents("Vertical Jump", [
        { component: null, label: "Overall" },
      ])
    ).toEqual([]);
  });

  it("falls back to the 40yd named list when the session has no components yet", () => {
    expect(testingDayNamedComponents("40yd_Dash", [])).toEqual([
      ...FORTY_YARD_COMPONENTS,
    ]);
  });

  it("falls back to the primary component for other cumulatives", () => {
    expect(testingDayNamedComponents("40m_Sprint", [])).toEqual(["0-40m"]);
  });
});

describe("sortTestingDayMetricKeys", () => {
  it("puts intake tests first then remaining keys alphabetically", () => {
    expect(
      sortTestingDayMetricKeys(["40yd_Dash", "10m_Accel", "Vertical Jump"])
    ).toEqual(["Vertical Jump", "40yd_Dash", "10m_Accel"]);
  });
});

describe("entryMatchesTestingDayComponent", () => {
  it("matches overall-only rows when the resolved component is null", () => {
    expect(
      entryMatchesTestingDayComponent(
        { component: null, interval_index: null },
        null
      )
    ).toBe(true);
    expect(
      entryMatchesTestingDayComponent(
        { component: "0-40yd", interval_index: 2 },
        null
      )
    ).toBe(false);
  });

  it("matches named 40yd components", () => {
    expect(
      entryMatchesTestingDayComponent(
        { component: "0-40yd", interval_index: 2 },
        "0-40yd"
      )
    ).toBe(true);
  });
});

describe("pickBestTestingDayHits", () => {
  it("keeps the higher jump and the lower time", () => {
    const jumps = pickBestTestingDayHits(
      [
        { athlete_id: "a", display_value: 20 },
        { athlete_id: "a", display_value: 24 },
      ],
      false
    );
    expect(jumps[0].display_value).toBe(24);

    const times = pickBestTestingDayHits(
      [
        { athlete_id: "a", display_value: 5.1 },
        { athlete_id: "a", display_value: 4.9 },
      ],
      true
    );
    expect(times[0].display_value).toBe(4.9);
  });
});

describe("buildTestingDayMatrix", () => {
  it("pivots athletes as rows and tests as columns, keeping reporting badges", () => {
    const vjKey = testingDayColumnKey("Vertical Jump", null);
    const fortyKey = testingDayColumnKey("40yd_Dash", "0-40yd");
    const matrix = buildTestingDayMatrix({
      columns: [
        {
          key: vjKey,
          metric_key: "Vertical Jump",
          display_name: "Vertical Jump",
          component: null,
          units: "in",
        },
        {
          key: fortyKey,
          metric_key: "40yd_Dash",
          display_name: "40yd Dash",
          component: "0-40yd",
          units: "s",
        },
      ],
      hitsByColumn: {
        [vjKey]: [
          hit({
            athlete_id: "vb",
            first_name: "Val",
            last_name: "Ball",
            gender: "F",
            display_value: 18,
            zone_label: "poor",
            zone_color: "#dc2626",
          }),
          hit({
            athlete_id: "fb",
            first_name: "Ford",
            last_name: "Ball",
            gender: "M",
            display_value: 28,
            zone_label: "elite",
            zone_color: "#2563eb",
          }),
        ],
        [fortyKey]: [
          hit({
            athlete_id: "fb",
            first_name: "Ford",
            last_name: "Ball",
            gender: "M",
            display_value: 4.5,
            zone_label: "efficient",
            zone_color: "#ca8a04",
          }),
        ],
      },
      memberships,
    });

    expect(matrix.athletes.map((a) => a.athlete_id)).toEqual(["fb", "vb"]);
    const ford = matrix.athletes[0];
    expect(ford.sport).toBe("football");
    expect(ford.cells[vjKey]?.zone_label).toBe("elite");
    expect(ford.cells[fortyKey]?.display_value).toBe(4.5);
    const val = matrix.athletes[1];
    expect(val.cells[vjKey]?.zone_label).toBe("poor");
    expect(val.cells[fortyKey]).toBeUndefined();
  });
});

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
