import { describe, expect, it } from "vitest";
import {
  aggregateIsoRocks,
  aggregateIsoRockActuals,
  extractSecondsNearAlias,
  type IsoTemplateRow,
} from "./iso-rocks";

describe("extractSecondsNearAlias", () => {
  it("parses seconds from warmup-style notes", () => {
    expect(
      extractSecondsNearAlias(
        "Spring ankle (bent-knee) 45s/leg · lunge ISO acc. 60s/leg",
        "spring ankle"
      )
    ).toBe(45);
    expect(
      extractSecondsNearAlias(
        "Spring ankle (bent-knee) 45s/leg · lunge ISO acc. 60s/leg",
        "lunge iso"
      )
    ).toBe(60);
  });

  it("parses targets like 20s/side", () => {
    expect(extractSecondsNearAlias("20s/side", "copenhagen")).toBe(20);
    expect(extractSecondsNearAlias(["20s/side", "25s/side"], "copenhagen")).toBe(
      25
    );
  });
});

describe("aggregateIsoRocks", () => {
  it("builds per-session max prescribed durations per rock", () => {
    const rows: IsoTemplateRow[] = [
      {
        session_date: "2026-08-11",
        movement_name: "Warmup Circuit",
        notes:
          "Spring ankle 45s/leg · hip hike 15/side · lunge ISO acc. 60s/leg",
        targets: [],
      },
      {
        session_date: "2026-08-11",
        movement_name: "Copenhagen Side-Plank",
        notes: null,
        targets: ["20s/side", "20s/side"],
      },
      {
        session_date: "2026-08-18",
        movement_name: "Warmup Circuit",
        notes: "Spring ankle 55s/leg · lunge ISO acc. 75s/leg",
        targets: [],
      },
      {
        session_date: "2026-08-18",
        movement_name: "Copenhagen Side-Plank",
        notes: null,
        targets: ["25s/side"],
      },
      {
        session_date: "2026-08-18",
        movement_name: "Sprinter Bridge",
        notes: "30s hold",
        targets: ["30s"],
      },
    ];

    const series = aggregateIsoRocks(rows);
    const spring = series.find((s) => s.rock_id === "spring_ankle")!;
    expect(spring.points).toEqual([
      { date: "2026-08-11", seconds: 45, n: 1 },
      { date: "2026-08-18", seconds: 55, n: 1 },
    ]);
    const copenhagen = series.find((s) => s.rock_id === "copenhagen")!;
    expect(copenhagen.points.map((p) => p.seconds)).toEqual([20, 25]);
    const bridge = series.find((s) => s.rock_id === "sprinter_bridge")!;
    expect(bridge.points).toEqual([
      { date: "2026-08-18", seconds: 30, n: 1 },
    ]);
  });

  it("uses notes hold seconds when name matches but notes omit the rock alias (9/18 soccer)", () => {
    const rows: IsoTemplateRow[] = [
      {
        session_date: "2026-09-18",
        movement_name: "Sprinter Bridge",
        notes: "60s hold · Long lever. Low-back barely off the ground",
        targets: ["45s", "45s"],
      },
      {
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        notes:
          "45s hold. Inside of ankle pressing down, if creating knee pain shift down",
        targets: ["40s"],
      },
      {
        session_date: "2026-09-18",
        movement_name: "ISO-Lunge",
        notes: null,
        targets: ["60s"],
      },
      {
        session_date: "2026-09-18",
        movement_name: "Spring Ankle",
        notes: null,
        targets: ["60s"],
      },
    ];

    const series = aggregateIsoRocks(rows);
    expect(
      series.find((s) => s.rock_id === "sprinter_bridge")?.points
    ).toEqual([{ date: "2026-09-18", seconds: 60, n: 1 }]);
    expect(series.find((s) => s.rock_id === "copenhagen")?.points).toEqual([
      { date: "2026-09-18", seconds: 45, n: 1 },
    ]);
    expect(series.find((s) => s.rock_id === "iso_lunge")?.points).toEqual([
      { date: "2026-09-18", seconds: 60, n: 1 },
    ]);
    expect(series.find((s) => s.rock_id === "spring_ankle")?.points).toEqual([
      { date: "2026-09-18", seconds: 60, n: 1 },
    ]);
  });
});

describe("aggregateIsoRockActuals", () => {
  it("medians each athlete's best hold per rock session date", () => {
    const series = aggregateIsoRockActuals([
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 40,
        units: "s",
      },
      {
        athlete_id: "a2",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 50,
        units: "s",
      },
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "ISO-Lunge",
        kind: "duration",
        load: 60,
        units: "s",
      },
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "DB Forward-to-Reverse Lunge",
        kind: "load_reps",
        load: 50,
        units: "lb",
      },
    ]);

    // One set each: totals median 45, per-set 45. Ignore load_reps lunges.
    expect(series.find((s) => s.rock_id === "copenhagen")?.total_points).toEqual([
      { date: "2026-09-18", seconds: 45, n: 2 },
    ]);
    expect(series.find((s) => s.rock_id === "copenhagen")?.per_set_points).toEqual([
      { date: "2026-09-18", seconds: 45, n: 2 },
    ]);
    expect(series.find((s) => s.rock_id === "iso_lunge")?.total_points).toEqual([
      { date: "2026-09-18", seconds: 60, n: 1 },
    ]);
    expect(series.find((s) => s.rock_id === "iso_lunge")?.per_set_points).toEqual([
      { date: "2026-09-18", seconds: 60, n: 1 },
    ]);
  });
});

describe("aggregateIsoRockActuals volume", () => {
  it("sums logged holds per athlete and medians total vs per-set", () => {
    const series = aggregateIsoRockActuals([
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 45,
        units: "s",
      },
      {
        athlete_id: "a1",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 45,
        units: "s",
      },
      {
        athlete_id: "a2",
        session_date: "2026-09-18",
        movement_name: "Copenhagen Plank",
        kind: "duration",
        load: 50,
        units: "s",
      },
    ]);
    const c = series.find((s) => s.rock_id === "copenhagen")!;
    // a1 total 90 per-set 45; a2 total 50 per-set 50 → median total 70, median per-set 47.5
    expect(c.total_points).toEqual([{ date: "2026-09-18", seconds: 70, n: 2 }]);
    expect(c.per_set_points).toEqual([{ date: "2026-09-18", seconds: 47.5, n: 2 }]);
  });
});
