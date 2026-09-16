import { describe, expect, it } from "vitest";
import {
  aggregateIsoRocks,
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
  it("builds weekly max prescribed durations per rock", () => {
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
      { week_start: "2026-08-10", seconds: 45, n: 1 },
      { week_start: "2026-08-17", seconds: 55, n: 1 },
    ]);
    const copenhagen = series.find((s) => s.rock_id === "copenhagen")!;
    expect(copenhagen.points.map((p) => p.seconds)).toEqual([20, 25]);
    const bridge = series.find((s) => s.rock_id === "sprinter_bridge")!;
    expect(bridge.points).toEqual([
      { week_start: "2026-08-17", seconds: 30, n: 1 },
    ]);
  });
});
