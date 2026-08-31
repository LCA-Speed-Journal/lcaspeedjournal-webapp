import { describe, it, expect } from "vitest";
import { attachExportZones } from "./export-zones";
import type {
  AttachZonesDefault,
  AttachZonesMembership,
  AttachZonesPopulation,
} from "./attach-zones";
import type { ExportThreshold } from "./export-zones";

const VJ_POP = "pop-vj";
const FORTY_POP = "pop-40";

const populations: AttachZonesPopulation[] = [
  { id: VJ_POP, name: "HS Volleyball VJ" },
  { id: FORTY_POP, name: "Football Skill 40yd" },
];

const memberships: AttachZonesMembership[] = [
  { athlete_id: "vb", hugo_group: "volleyball", is_primary: true },
  { athlete_id: "sc", hugo_group: "soccer", is_primary: true },
  { athlete_id: "xc", hugo_group: "xc", is_primary: false },
];

const defaults: AttachZonesDefault[] = [
  { hugo_group: "volleyball", metric_key: "Vertical Jump", population_id: VJ_POP },
  { hugo_group: "soccer", metric_key: "40yd_Dash", population_id: FORTY_POP },
];

const thresholds: ExportThreshold[] = [
  {
    population_id: VJ_POP,
    metric_key: "Vertical Jump",
    gender: "F",
    component: null,
    label: "efficient",
    threshold: 20,
  },
  {
    population_id: VJ_POP,
    metric_key: "Vertical Jump",
    gender: "F",
    component: null,
    label: "elite",
    threshold: 28,
  },
  {
    population_id: FORTY_POP,
    metric_key: "40yd_Dash",
    gender: "M",
    component: "0-40yd",
    label: "efficient",
    threshold: 5.0,
  },
  {
    population_id: FORTY_POP,
    metric_key: "40yd_Dash",
    gender: "M",
    component: "0-40yd",
    label: "elite",
    threshold: 4.5,
  },
  {
    population_id: FORTY_POP,
    metric_key: "40yd_Dash",
    gender: "M",
    component: "0-10yd",
    label: "efficient",
    threshold: 1.7,
  },
];

function lowerIsBetterFor(metricKey: string): boolean {
  return metricKey === "40yd_Dash";
}

describe("attachExportZones unbadged", () => {
  it("writes empty strings when the mark is below the easiest cut", () => {
    const [row] = attachExportZones({
      rows: [
        {
          athlete_id: "vb",
          gender: "F",
          metric_key: "Vertical Jump",
          component: null,
          display_value: 18,
        },
      ],
      memberships,
      defaults,
      thresholds,
      populations,
      lowerIsBetterFor,
    });

    expect(row.zone_label).toBe("");
    expect(row.population_name).toBe("");
  });

  it("writes empty strings when the athlete has no primary sport", () => {
    const [row] = attachExportZones({
      rows: [
        {
          athlete_id: "xc",
          gender: "M",
          metric_key: "Vertical Jump",
          component: null,
          display_value: 22,
        },
      ],
      memberships,
      defaults,
      thresholds,
      populations,
      lowerIsBetterFor,
    });

    expect(row.zone_label).toBe("");
    expect(row.population_name).toBe("");
  });
});

describe("attachExportZones batch", () => {
  it("attaches each row from its own metric using primary sport defaults", () => {
    const rows = attachExportZones({
      rows: [
        {
          athlete_id: "vb",
          gender: "F",
          metric_key: "Vertical Jump",
          component: null,
          display_value: "22",
        },
        {
          athlete_id: "sc",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "0-40yd",
          display_value: 4.5,
        },
        {
          athlete_id: "vb",
          gender: "F",
          metric_key: "Vertical Jump",
          component: null,
          display_value: 18,
        },
      ],
      memberships,
      defaults,
      thresholds,
      populations,
      lowerIsBetterFor,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      athlete_id: "vb",
      display_value: "22",
      zone_label: "efficient",
      population_name: "HS Volleyball VJ",
    });
    expect(rows[1]).toMatchObject({
      athlete_id: "sc",
      component: "0-40yd",
      zone_label: "elite",
      population_name: "Football Skill 40yd",
    });
    expect(rows[2]).toMatchObject({
      athlete_id: "vb",
      zone_label: "",
      population_name: "",
    });
  });
});

describe("attachExportZones component matching", () => {
  it("uses the row's own component so 40yd splits do not share full-dash cuts", () => {
    const rows = attachExportZones({
      rows: [
        {
          athlete_id: "sc",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "0-10yd",
          display_value: 1.65,
        },
        {
          athlete_id: "sc",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "0-40yd",
          display_value: 4.9,
        },
        {
          athlete_id: "sc",
          gender: "M",
          metric_key: "40yd_Dash",
          component: null,
          display_value: 4.4,
        },
      ],
      memberships,
      defaults,
      thresholds,
      populations,
      lowerIsBetterFor,
    });

    expect(rows[0].zone_label).toBe("efficient");
    expect(rows[0].population_name).toBe("Football Skill 40yd");
    expect(rows[1].zone_label).toBe("efficient");
    expect(rows[1].population_name).toBe("Football Skill 40yd");
    expect(rows[2].zone_label).toBe("");
    expect(rows[2].population_name).toBe("");
  });
});

describe("attachExportZones metric isolation", () => {
  it("does not apply another metric's cuts that share a population", () => {
    const samePopThresholds: ExportThreshold[] = [
      ...thresholds,
      {
        population_id: FORTY_POP,
        metric_key: "Vertical Jump",
        gender: "M",
        component: null,
        label: "elite",
        threshold: 20,
      },
    ];

    const [row] = attachExportZones({
      rows: [
        {
          athlete_id: "sc",
          gender: "M",
          metric_key: "40yd_Dash",
          component: null,
          display_value: 22,
        },
      ],
      memberships,
      defaults,
      thresholds: samePopThresholds,
      populations,
      lowerIsBetterFor,
    });

    expect(row.zone_label).toBe("");
    expect(row.population_name).toBe("");
  });
});
