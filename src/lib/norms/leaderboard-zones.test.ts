import { describe, it, expect } from "vitest";
import {
  applyLeaderboardZones,
  mapThresholdRows,
  parsePopulationIdParam,
  resolveSelectedPopulation,
  uniqueZoneLabels,
} from "./leaderboard-zones";
import type {
  AttachZonesDefault,
  AttachZonesMembership,
  AttachZonesPopulation,
  AttachZonesThreshold,
} from "./attach-zones";

const VJ_POP = "11111111-1111-4111-8111-111111111111";
const FORTY_POP = "22222222-2222-4222-8222-222222222222";
const MISSING_POP = "33333333-3333-4333-8333-333333333333";

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
  { population_id: FORTY_POP, gender: "M", component: null, label: "efficient", threshold: 5.0 },
  { population_id: FORTY_POP, gender: "M", component: null, label: "elite", threshold: 4.5 },
];

describe("parsePopulationIdParam", () => {
  it("treats missing or blank as no override", () => {
    expect(parsePopulationIdParam(null)).toEqual({ ok: true, populationId: null });
    expect(parsePopulationIdParam("")).toEqual({ ok: true, populationId: null });
    expect(parsePopulationIdParam("   ")).toEqual({ ok: true, populationId: null });
  });

  it("rejects a non-UUID override", () => {
    expect(parsePopulationIdParam("not-a-uuid")).toEqual({
      ok: false,
      error: "Invalid population_id",
    });
  });

  it("accepts a UUID override", () => {
    expect(parsePopulationIdParam(VJ_POP)).toEqual({
      ok: true,
      populationId: VJ_POP,
    });
  });
});

describe("resolveSelectedPopulation", () => {
  it("returns null selected when there is no override", () => {
    expect(resolveSelectedPopulation(null, populations)).toEqual({
      ok: true,
      selectedPopulationId: null,
    });
  });

  it("returns not found when override is missing from the public list", () => {
    expect(resolveSelectedPopulation(MISSING_POP, populations)).toEqual({
      ok: false,
      error: "Population not found",
    });
  });

  it("returns the override id when it exists", () => {
    expect(resolveSelectedPopulation(FORTY_POP, populations)).toEqual({
      ok: true,
      selectedPopulationId: FORTY_POP,
    });
  });
});

describe("applyLeaderboardZones", () => {
  it("attaches zones from sport defaults and adds population_id on hits", () => {
    const result = applyLeaderboardZones({
      rows: [
        { athlete_id: "vb", gender: "F", display_value: 22, rank: 1 },
        { athlete_id: "sc", gender: "M", display_value: 18, rank: 2 },
      ],
      memberships,
      defaults,
      thresholds,
      populations,
      metricKey: "Vertical Jump",
      component: null,
      lowerIsBetter: false,
    });

    expect(result.selected_population_id).toBeNull();
    expect(result.populations).toEqual(populations);

    const vb = result.rows.find((r) => r.athlete_id === "vb");
    expect(vb).toMatchObject({
      rank: 1,
      zone_label: "efficient",
      zone_color: "#ca8a04",
      population_name: "HS Volleyball VJ",
      population_id: VJ_POP,
    });

    const sc = result.rows.find((r) => r.athlete_id === "sc");
    expect(sc?.zone_label).toBeUndefined();
    expect(sc?.population_id).toBeUndefined();
    expect(sc?.rank).toBe(2);
  });

  it("override paints every athlete with that table", () => {
    const result = applyLeaderboardZones({
      rows: [
        { athlete_id: "vb", gender: "M", display_value: 4.5 },
        { athlete_id: "sc", gender: "M", display_value: 4.5 },
      ],
      memberships,
      defaults,
      thresholds,
      populations,
      metricKey: "40yd_Dash",
      component: null,
      lowerIsBetter: true,
      overridePopulationId: FORTY_POP,
    });

    expect(result.selected_population_id).toBe(FORTY_POP);
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.zone_label).toBe("elite");
      expect(row.zone_color).toBe("#2563eb");
      expect(row.population_name).toBe("Football Skill 40yd");
      expect(row.population_id).toBe(FORTY_POP);
    }
  });

  it("leaves rows unbadged below the easiest cut", () => {
    const result = applyLeaderboardZones({
      rows: [{ athlete_id: "vb", gender: "F", display_value: 18 }],
      memberships,
      defaults,
      thresholds,
      populations,
      metricKey: "Vertical Jump",
      component: null,
      lowerIsBetter: false,
    });

    expect(result.rows[0].zone_label).toBeUndefined();
    expect(result.rows[0].zone_color).toBeUndefined();
  });
});

describe("mapThresholdRows", () => {
  it("coerces numeric strings and empty component to null", () => {
    expect(
      mapThresholdRows([
        {
          population_id: VJ_POP,
          gender: "F",
          component: "",
          label: "efficient",
          threshold: "20.0",
        },
        {
          population_id: VJ_POP,
          gender: "F",
          component: "0-40yd",
          label: "elite",
          threshold: 28,
        },
      ])
    ).toEqual([
      {
        population_id: VJ_POP,
        gender: "F",
        component: null,
        label: "efficient",
        threshold: 20,
      },
      {
        population_id: VJ_POP,
        gender: "F",
        component: "0-40yd",
        label: "elite",
        threshold: 28,
      },
    ]);
  });
});

describe("uniqueZoneLabels", () => {
  it("returns palette-order labels present in the result set", () => {
    expect(
      uniqueZoneLabels([
        { zone_label: "elite" },
        { zone_label: "efficient" },
        { zone_label: "elite" },
        {},
      ])
    ).toEqual(["efficient", "elite"]);
  });
});
