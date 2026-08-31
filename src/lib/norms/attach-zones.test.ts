import { describe, it, expect } from "vitest";
import { attachZones } from "./attach-zones";
import type {
  AttachZonesDefault,
  AttachZonesMembership,
  AttachZonesPopulation,
  AttachZonesThreshold,
} from "./attach-zones";

const VJ_POP = "pop-vj";
const FORTY_POP = "pop-40";

const populations: AttachZonesPopulation[] = [
  { id: VJ_POP, name: "HS Volleyball VJ" },
  { id: FORTY_POP, name: "Football Skill 40yd" },
];

const memberships: AttachZonesMembership[] = [
  { athlete_id: "vb", hugo_group: "volleyball", is_primary: true },
  { athlete_id: "sc", hugo_group: "soccer", is_primary: true },
];

const defaults: AttachZonesDefault[] = [
  { hugo_group: "volleyball", metric_key: "Vertical Jump", population_id: VJ_POP },
  { hugo_group: "soccer", metric_key: "40yd_Dash", population_id: FORTY_POP },
];

const thresholds: AttachZonesThreshold[] = [
  { population_id: VJ_POP, gender: "F", component: null, label: "efficient", threshold: 20 },
  { population_id: VJ_POP, gender: "F", component: null, label: "elite", threshold: 28 },
  { population_id: VJ_POP, gender: "F", component: null, label: "not-a-zone", threshold: 15 },
  { population_id: FORTY_POP, gender: "M", component: null, label: "efficient", threshold: 5.0 },
  { population_id: FORTY_POP, gender: "M", component: null, label: "elite", threshold: 4.5 },
];

describe("attachZones mixed sports", () => {
  it("assigns volleyball VJ and soccer-on-football-40 from their sport defaults", () => {
    const shared = { memberships, defaults, thresholds, populations };

    const [vb] = attachZones({
      ...shared,
      rows: [{ athlete_id: "vb", gender: "female", display_value: 22 }],
      metricKey: "Vertical Jump",
      component: null,
      lowerIsBetter: false,
    });
    expect(vb.zone_label).toBe("efficient");
    expect(vb.zone_color).toBe("#ca8a04");
    expect(vb.population_name).toBe("HS Volleyball VJ");

    const [sc] = attachZones({
      ...shared,
      rows: [{ athlete_id: "sc", gender: "male", display_value: 4.5 }],
      metricKey: "40yd_Dash",
      component: null,
      lowerIsBetter: true,
    });
    expect(sc.zone_label).toBe("elite");
    expect(sc.zone_color).toBe("#2563eb");
    expect(sc.population_name).toBe("Football Skill 40yd");
  });
});

describe("attachZones override", () => {
  it("overridePopulationId paints everyone with that table", () => {
    const rows = [
      { athlete_id: "vb", gender: "M", display_value: 4.5 },
      { athlete_id: "sc", gender: "M", display_value: 4.5 },
    ];
    const base = {
      rows,
      memberships,
      defaults,
      thresholds,
      populations,
      metricKey: "40yd_Dash",
      component: null as string | null,
      lowerIsBetter: true,
    };

    const without = attachZones(base);
    const vbWithout = without.find((r) => r.athlete_id === "vb");
    const scWithout = without.find((r) => r.athlete_id === "sc");
    expect(vbWithout?.zone_label).toBeUndefined();
    expect(scWithout?.zone_label).toBe("elite");
    expect(scWithout?.population_name).toBe("Football Skill 40yd");

    const painted = attachZones({ ...base, overridePopulationId: FORTY_POP });
    expect(painted).toHaveLength(2);
    for (const row of painted) {
      expect(row.zone_label).toBe("elite");
      expect(row.zone_color).toBe("#2563eb");
      expect(row.population_name).toBe("Football Skill 40yd");
    }
  });
});

describe("attachZones missing primary", () => {
  it("returns the row with no zone when athlete has no primary membership", () => {
    const [row] = attachZones({
      rows: [{ athlete_id: "xc", gender: "M", display_value: 22 }],
      memberships: [{ athlete_id: "xc", hugo_group: "xc", is_primary: false }],
      defaults: [
        { hugo_group: "xc", metric_key: "Vertical Jump", population_id: VJ_POP },
      ],
      thresholds,
      populations,
      metricKey: "Vertical Jump",
      component: null,
      lowerIsBetter: false,
    });

    expect(row.athlete_id).toBe("xc");
    expect(row.display_value).toBe(22);
    expect(row.zone_label).toBeUndefined();
    expect(row.zone_color).toBeUndefined();
    expect(row.population_name).toBeUndefined();
  });
});

describe("attachZones empty gender table", () => {
  it("attaches no zone when thresholds exist only for the other gender", () => {
    const [row] = attachZones({
      rows: [{ athlete_id: "vb", gender: "M", display_value: 22 }],
      memberships,
      defaults,
      thresholds,
      populations,
      metricKey: "Vertical Jump",
      component: null,
      lowerIsBetter: false,
    });

    expect(row.athlete_id).toBe("vb");
    expect(row.zone_label).toBeUndefined();
    expect(row.zone_color).toBeUndefined();
    expect(row.population_name).toBeUndefined();
  });
});
