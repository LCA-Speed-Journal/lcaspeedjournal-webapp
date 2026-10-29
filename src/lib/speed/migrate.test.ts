import { describe, expect, it } from "vitest";
import { planSpeedMigration, type LegacyEntry } from "./migrate";

function row(partial: Partial<LegacyEntry> & Pick<LegacyEntry, "id" | "metric_key">): LegacyEntry {
  return {
    session_id: "s1",
    athlete_id: "a1",
    component: null,
    value: 1.7,
    display_value: 1.7,
    units: "s",
    ...partial,
  };
}

describe("planSpeedMigration", () => {
  it("rewrites a 10m accel and leaves a sled alone", () => {
    const plan = planSpeedMigration([
      row({ id: "accel", metric_key: "10m_Accel" }),
      row({ id: "sled", metric_key: "10m_Light-Sled" }),
    ]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({
      id: "accel",
      metric_key: "Acceleration",
      distance_unit: "m",
      start_distance: 0,
      end_distance: 10,
      units: "s",
      legacy_metric_key: "10m_Accel",
    });
    expect(plan.skipped.map((item) => item.id)).toEqual(["sled"]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("collapses a parent split and the matching mph row", () => {
    const plan = planSpeedMigration([
      row({
        id: "parent",
        metric_key: "20m_Accel",
        component: "10-20m",
        value: 1.05,
        display_value: 1.05,
        units: "s",
      }),
      row({
        id: "split",
        metric_key: "10-20m_Split",
        component: "10-20m",
        value: 1.05,
        display_value: 21.3,
        units: "mph",
      }),
    ]);
    expect(plan.updates.map((item) => item.id)).toEqual(["split"]);
    expect(plan.updates[0].units).toBe("mph");
    expect(plan.updates[0].value).toBeCloseTo(1.05);
    expect(plan.deleteIds).toEqual(["parent"]);
  });

  it("does not collapse two flies whose times disagree", () => {
    const plan = planSpeedMigration([
      row({ id: "a", metric_key: "10-20m_Split", component: "10-20m", value: 1.0, display_value: 1.0, units: "s" }),
      row({ id: "b", metric_key: "10-20m_Split", component: "10-20m", value: 1.2, display_value: 1.2, units: "s" }),
    ]);
    expect(plan.updates).toHaveLength(2);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("reports a MaxVelocity row with no distance", () => {
    const plan = planSpeedMigration([
      row({ id: "mv", metric_key: "MaxVelocity", units: "mph", value: 21, display_value: 21 }),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.unparsed.map((item) => item.id)).toEqual(["mv"]);
  });

  it("keeps planning when one mph row cannot convert", () => {
    const plan = planSpeedMigration([
      row({ id: "bad", metric_key: "10-20m_Split", component: "10-20m", units: "mph", display_value: 0 }),
      row({ id: "accel", metric_key: "10m_Accel" }),
    ]);
    expect(plan.updates.map((item) => item.id)).toEqual(["accel"]);
    expect(plan.unparsed.map((item) => item.id)).toEqual(["bad"]);
  });
});
