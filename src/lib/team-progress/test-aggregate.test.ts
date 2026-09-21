import { describe, expect, it } from "vitest";
import {
  aggregateTestSeries,
  athleteTestDeltas,
  listAvailableExtraMetrics,
  type TestEntryRow,
} from "./test-aggregate";

const rows: TestEntryRow[] = [
  // Session A — 40yd
  {
    athlete_id: "a1",
    session_date: "2026-08-10",
    metric_key: "40yd_Dash",
    component: "0-40yd",
    display_value: 5.2,
    units: "s",
  },
  {
    athlete_id: "a2",
    session_date: "2026-08-10",
    metric_key: "40yd_Dash",
    component: "0-40yd",
    display_value: 5.0,
    units: "s",
  },
  {
    athlete_id: "a3",
    session_date: "2026-08-10",
    metric_key: "40yd_Dash",
    component: "0-40yd",
    display_value: 5.4,
    units: "s",
  },
  {
    athlete_id: "a3",
    session_date: "2026-08-10",
    metric_key: "40yd_Dash",
    component: "0-10yd",
    display_value: 1.8,
    units: "s",
  },
  // Session B
  {
    athlete_id: "a1",
    session_date: "2026-10-01",
    metric_key: "40yd_Dash",
    component: "0-40yd",
    display_value: 5.0,
    units: "s",
  },
  {
    athlete_id: "a2",
    session_date: "2026-10-01",
    metric_key: "40yd_Dash",
    component: "0-40yd",
    display_value: 4.9,
    units: "s",
  },
  {
    athlete_id: "a3",
    session_date: "2026-10-01",
    metric_key: "40yd_Dash",
    component: "0-40yd",
    display_value: 5.1,
    units: "s",
  },
  // RSI only for volleyball extras
  {
    athlete_id: "a1",
    session_date: "2026-09-01",
    metric_key: "10-5_RSI",
    component: null,
    display_value: 1.8,
    units: "RSI",
  },
  {
    athlete_id: "a2",
    session_date: "2026-09-01",
    metric_key: "10-5_RSI",
    component: null,
    display_value: 2.0,
    units: "RSI",
  },
  {
    athlete_id: "a3",
    session_date: "2026-09-01",
    metric_key: "10-5_RSI",
    component: null,
    display_value: 1.9,
    units: "RSI",
  },
];

describe("aggregateTestSeries", () => {
  it("builds team median series for core 40yd using primary component only", () => {
    const series = aggregateTestSeries({
      rows,
      metricKeys: ["40yd_Dash"],
      hugoGroup: "football",
      addedMetrics: [],
      minN: 3,
    });
    expect(series).toHaveLength(1);
    const forty = series[0]!;
    expect(forty.metric_key).toBe("40yd_Dash");
    expect(forty.source).toBe("core");
    expect(forty.lower_is_better).toBe(true);
    expect(forty.points).toHaveLength(2);

    expect(forty.points[0]!.date).toBe("2026-08-10");
    expect(forty.points[0]!.median).toBe(5.2);
    expect(forty.points[0]!.median_change_pct).toBe(0);
    expect(forty.points[0]!.n).toBe(3);
    expect(forty.points[0]!.output?.min).toBe(5.0);
    expect(forty.points[0]!.output?.median).toBe(5.2);
    expect(forty.points[0]!.output?.max).toBe(5.4);
    expect(forty.points[0]!.output?.mean).toBeCloseTo((5.2 + 5.0 + 5.4) / 3);
    expect(forty.points[0]!.change?.min).toBe(0);
    expect(forty.points[0]!.change?.median).toBe(0);
    expect(forty.points[0]!.change?.max).toBe(0);
    expect(forty.points[0]!.change?.mean).toBe(0);

    const a1Change = ((5.0 - 5.2) / 5.2) * 100;
    const a2Change = ((4.9 - 5.0) / 5.0) * 100;
    const a3Change = ((5.1 - 5.4) / 5.4) * 100;
    expect(forty.points[1]!.date).toBe("2026-10-01");
    expect(forty.points[1]!.median).toBe(5.0);
    expect(forty.points[1]!.median_change_pct).toBeCloseTo(a1Change);
    expect(forty.points[1]!.n).toBe(3);
    expect(forty.points[1]!.output?.min).toBe(4.9);
    expect(forty.points[1]!.output?.median).toBe(5.0);
    expect(forty.points[1]!.output?.max).toBe(5.1);
    expect(forty.points[1]!.output?.mean).toBeCloseTo((5.0 + 4.9 + 5.1) / 3);
    expect(forty.points[1]!.change?.min).toBeCloseTo(a3Change);
    expect(forty.points[1]!.change?.median).toBeCloseTo(a1Change);
    expect(forty.points[1]!.change?.max).toBeCloseTo(a2Change);
    expect(forty.points[1]!.change?.mean).toBeCloseTo(
      (a1Change + a2Change + a3Change) / 3
    );

    expect(forty.first?.median).toBe(5.2);
    expect(forty.last?.median).toBe(5.0);
    expect(forty.delta).toBeCloseTo(-0.2);
    expect(forty.improved_pct).toBe(1);
  });

  it("marks group extras and lists available add-on metrics", () => {
    const series = aggregateTestSeries({
      rows,
      metricKeys: ["10-5_RSI"],
      hugoGroup: "volleyball",
      addedMetrics: [],
      minN: 3,
    });
    expect(series[0]!.source).toBe("group_extra");
    expect(series[0]!.lower_is_better).toBe(false);
    expect(
      listAvailableExtraMetrics(rows, "volleyball", [])
    ).not.toContain("10-5_RSI");
    expect(listAvailableExtraMetrics(rows, "football", [])).toContain(
      "10-5_RSI"
    );
  });

  it("computes per-athlete first/last deltas", () => {
    const deltas = athleteTestDeltas(rows, "40yd_Dash", true);
    expect(deltas.get("a1")!.first).toBe(5.2);
    expect(deltas.get("a1")!.last).toBe(5.0);
    expect(deltas.get("a1")!.delta).toBeCloseTo(-0.2);
    expect(deltas.get("a2")!.first).toBe(5.0);
    expect(deltas.get("a2")!.last).toBe(4.9);
    expect(deltas.get("a2")!.delta).toBeCloseTo(-0.1);
  });
});
