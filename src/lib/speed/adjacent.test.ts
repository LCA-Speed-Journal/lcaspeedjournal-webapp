import { describe, expect, it } from "vitest";
import { spanningBuildInKeys, type SpeedWindowRow } from "./adjacent";

const session = "s1";

function row(partial: Partial<SpeedWindowRow> & Pick<SpeedWindowRow, "metric_key" | "component">): SpeedWindowRow {
  return {
    session_id: session,
    distance_unit: partial.component.endsWith("m") ? "m" : "yd",
    start_distance: 0,
    end_distance: 0,
    ...partial,
  };
}

describe("spanningBuildInKeys", () => {
  it("hides 10-40 when 10-20 is in the same session and keeps every acceleration", () => {
    const rows: SpeedWindowRow[] = [
      row({ metric_key: "Acceleration", component: "0-10yd", start_distance: 0, end_distance: 10 }),
      row({ metric_key: "Acceleration", component: "0-40yd", start_distance: 0, end_distance: 40 }),
      row({ metric_key: "BuildIn", component: "10-20yd", start_distance: 10, end_distance: 20 }),
      row({ metric_key: "BuildIn", component: "20-40yd", start_distance: 20, end_distance: 40 }),
      row({ metric_key: "BuildIn", component: "10-40yd", start_distance: 10, end_distance: 40 }),
    ];
    expect(spanningBuildInKeys(rows)).toEqual(new Set(["s1|yd|10|40"]));
  });

  it("keeps a 10-40 that is the only window in its session", () => {
    const rows: SpeedWindowRow[] = [
      row({
        session_id: "solo",
        metric_key: "BuildIn",
        component: "10-40yd",
        start_distance: 10,
        end_distance: 40,
      }),
    ];
    expect(spanningBuildInKeys(rows).size).toBe(0);
  });

  it("does not let a meter window hide a yard window", () => {
    const rows: SpeedWindowRow[] = [
      row({ metric_key: "BuildIn", component: "10-20m", distance_unit: "m", start_distance: 10, end_distance: 20 }),
      row({ metric_key: "BuildIn", component: "10-40yd", start_distance: 10, end_distance: 40 }),
    ];
    expect(spanningBuildInKeys(rows).size).toBe(0);
  });
});
