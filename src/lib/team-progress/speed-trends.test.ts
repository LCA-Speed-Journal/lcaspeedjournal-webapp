import { describe, expect, it } from "vitest";
import { reconstructFiveFifteen } from "@/lib/norms/f2f/reconstruct-515";
import { percentChange } from "./stats";
import { aggregateSpeedTrends, type SpeedTrendRow } from "./speed-trends";

function mark(
  partial: Partial<SpeedTrendRow> &
    Pick<SpeedTrendRow, "component" | "session_date" | "display_value">
): SpeedTrendRow {
  return {
    athlete_id: "a1",
    session_id: partial.session_date,
    metric_key: "BuildIn",
    distance_unit: "yd",
    start_distance: 0,
    end_distance: 0,
    value: partial.display_value,
    units: "mph",
    ...partial,
  };
}

describe("aggregateSpeedTrends", () => {
  it("baselines 5-15 from the reconstructed 5-10 and 10-20, then uses a later timed fly", () => {
    const reconstructed = reconstructFiveFifteen(0.7, 1.3);
    expect(reconstructed).not.toBeNull();

    const trends = aggregateSpeedTrends([
      mark({
        session_date: "2026-08-01",
        component: "5-10yd",
        start_distance: 5,
        end_distance: 10,
        value: 0.7,
        display_value: 0.7,
        units: "s",
        metric_key: "BuildIn",
      }),
      mark({
        session_date: "2026-08-01",
        component: "10-20yd",
        start_distance: 10,
        end_distance: 20,
        value: 1.3,
        display_value: 1.3,
        units: "s",
        metric_key: "BuildIn",
      }),
      mark({
        session_date: "2026-09-01",
        component: "5-15yd",
        start_distance: 5,
        end_distance: 15,
        value: 1.1,
        display_value: 18.6,
      }),
    ]);
    const five = trends.find((trend) => trend.component === "5-15yd")!;
    expect(five.points[0]!.date).toBe("2026-08-01");
    expect(five.points[0]!.median_change_pct).toBe(0);
    expect(five.points[1]!.output?.median).toBe(18.6);
    expect(five.points[1]!.median_change_pct).toBe(
      percentChange(18.6, reconstructed!.mph)
    );
  });

  it("drops a spanning 10-40 and keeps 10-20", () => {
    const trends = aggregateSpeedTrends([
      mark({
        component: "10-20yd",
        session_date: "2026-09-01",
        start_distance: 10,
        end_distance: 20,
        display_value: 19,
        session_id: "s1",
      }),
      mark({
        component: "10-40yd",
        session_date: "2026-09-01",
        start_distance: 10,
        end_distance: 40,
        display_value: 17,
        session_id: "s1",
      }),
      mark({
        component: "10-20yd",
        session_date: "2026-09-08",
        start_distance: 10,
        end_distance: 20,
        display_value: 20,
        session_id: "s2",
      }),
    ]);
    expect(trends.map((trend) => trend.component)).toEqual(["10-20yd"]);
  });

  it("keeps a timed 5-15 when a shorter split sits inside it", () => {
    const trends = aggregateSpeedTrends([
      mark({
        component: "5-10yd",
        session_date: "2026-09-01",
        session_id: "s1",
        start_distance: 5,
        end_distance: 10,
        display_value: 16,
      }),
      mark({
        component: "5-15yd",
        session_date: "2026-09-01",
        session_id: "s1",
        start_distance: 5,
        end_distance: 15,
        display_value: 18,
      }),
      mark({
        component: "5-15yd",
        session_date: "2026-09-08",
        session_id: "s2",
        start_distance: 5,
        end_distance: 15,
        display_value: 19,
      }),
    ]);
    const five = trends.find((trend) => trend.component === "5-15yd");
    expect(five?.points.map((point) => point.output?.median)).toEqual([18, 19]);
    expect(trends.map((trend) => trend.component)).toEqual(["5-15yd"]);
  });

  it("pairs 5-10 and 10-20 from the same rep, not across reps", () => {
    const sameRep = reconstructFiveFifteen(0.7, 1.3);
    const crossed = reconstructFiveFifteen(0.7, 1.6);
    expect(sameRep).not.toBeNull();
    expect(crossed).not.toBeNull();
    expect(sameRep!.mph).not.toBe(crossed!.mph);

    const trends = aggregateSpeedTrends([
      mark({
        id: "a",
        session_id: "s1",
        session_date: "2026-08-01",
        component: "5-10yd",
        start_distance: 5,
        end_distance: 10,
        value: 0.7,
        display_value: 0.7,
        units: "s",
      }),
      mark({
        id: "d",
        session_id: "s1",
        session_date: "2026-08-01",
        component: "10-20yd",
        start_distance: 10,
        end_distance: 20,
        value: 1.6,
        display_value: 1.6,
        units: "s",
      }),
      mark({
        id: "c",
        session_id: "s1",
        session_date: "2026-08-01",
        component: "5-10yd",
        start_distance: 5,
        end_distance: 10,
        value: 0.9,
        display_value: 0.9,
        units: "s",
      }),
      mark({
        id: "b",
        session_id: "s1",
        session_date: "2026-08-01",
        component: "10-20yd",
        start_distance: 10,
        end_distance: 20,
        value: 1.3,
        display_value: 1.3,
        units: "s",
      }),
      mark({
        session_date: "2026-09-01",
        component: "5-15yd",
        start_distance: 5,
        end_distance: 15,
        display_value: 18.6,
      }),
    ]);
    const five = trends.find((trend) => trend.component === "5-15yd")!;
    expect(five.points[0]!.median).toBe(sameRep!.mph);
  });
});
