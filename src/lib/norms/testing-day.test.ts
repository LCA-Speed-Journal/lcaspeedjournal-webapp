import { describe, it, expect } from "vitest";
import { summarizeTestingDay } from "./testing-day";
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
