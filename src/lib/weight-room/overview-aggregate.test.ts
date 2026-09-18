import { describe, it, expect } from "vitest";
import {
  aggregateWeightRoomReport,
  type ReportMovement,
} from "./report-aggregate";
import {
  buildWeightRoomOverview,
  groupOverviewOutputs,
  type OverviewOutput,
} from "./overview-aggregate";

const baseReport = aggregateWeightRoomReport({
  hugo_group: "soccer",
  from: "2026-08-17",
  to: "2026-08-23",
  logs: [
    {
      id: "log-1",
      athlete_id: "a1",
      template_id: "t1",
      session_date: "2026-08-18",
      hugo_group: "soccer",
    },
  ],
  results: [
    {
      session_log_id: "log-1",
      movement_id: "m1",
      raw_text: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
      units: "lb",
    },
  ],
  movements: [{ id: "m1", name: "Trap-Bar Deadlift" }],
  athletes: [{ id: "a1", first_name: "Jane", last_name: "Smith" }],
});

describe("buildWeightRoomOverview", () => {
  it("lists rostered athletes with no confirmed log as no-shows", () => {
    const overview = buildWeightRoomOverview(baseReport, [
      { id: "a1", first_name: "Jane", last_name: "Smith" },
      { id: "a2", first_name: "Pat", last_name: "Lee" },
    ]);
    expect(overview.noShows.map((a) => a.id)).toEqual(["a2"]);
    expect(overview.attendanceCount).toBe(1);
    expect(overview.rosterCount).toBe(2);
  });

  it("exposes best load and outputs from the report", () => {
    const overview = buildWeightRoomOverview(baseReport, [
      { id: "a1", first_name: "Jane", last_name: "Smith" },
    ]);
    expect(overview.bestLoads[0]).toMatchObject({
      athlete_id: "a1",
      load: 185,
    });
    expect(overview.noShows).toEqual([]);
  });

  it("groups outputs by metric and ranks best-first within each group", () => {
    const report = aggregateWeightRoomReport({
      hugo_group: "volleyball",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [
        { id: "a1", first_name: "Ada", last_name: "Lovelace" },
        { id: "a2", first_name: "Alan", last_name: "Turing" },
        { id: "a3", first_name: "Grace", last_name: "Hopper" },
      ],
      movements: [
        {
          id: "mov-515",
          name: "5-15yd",
          speed_journal_metric_key: "40yd_Dash",
          speed_journal_component: "5-15yd",
        },
        { id: "mov-cmj", name: "CMJ" },
      ],
      logs: [
        {
          id: "log-ada",
          athlete_id: "a1",
          template_id: "t",
          session_date: "2026-09-14",
          hugo_group: "volleyball",
        },
        {
          id: "log-alan",
          athlete_id: "a2",
          template_id: "t",
          session_date: "2026-09-14",
          hugo_group: "volleyball",
        },
        {
          id: "log-grace",
          athlete_id: "a3",
          template_id: "t",
          session_date: "2026-09-14",
          hugo_group: "volleyball",
        },
      ],
      results: [
        {
          session_log_id: "log-ada",
          movement_id: "mov-515",
          raw_text: "1.68s",
          kind: "duration",
          load: 1.68,
          reps: null,
          units: "s",
        },
        {
          session_log_id: "log-alan",
          movement_id: "mov-515",
          raw_text: "1.50s",
          kind: "duration",
          load: 1.5,
          reps: null,
          units: "s",
        },
        {
          session_log_id: "log-ada",
          movement_id: "mov-cmj",
          raw_text: "22 in",
          kind: "output",
          load: 22,
          reps: null,
          units: "in",
        },
        {
          session_log_id: "log-grace",
          movement_id: "mov-cmj",
          raw_text: "25 in",
          kind: "output",
          load: 25,
          reps: null,
          units: "in",
        },
      ],
    });

    const overview = buildWeightRoomOverview(report, []);
    expect(overview.outputGroups.map((g) => g.label)).toEqual([
      "5-15yd",
      "CMJ",
    ]);
    expect(overview.outputGroups[0].rows.map((r) => r.athlete_id)).toEqual([
      "a2",
      "a1",
    ]);
    expect(overview.outputGroups[0].rows[0].units).toBe("mph");
    expect(overview.outputGroups[1].rows.map((r) => r.athlete_id)).toEqual([
      "a3",
      "a1",
    ]);
    expect(overview.outputGroups[1].rows[0].load).toBe(25);
  });
});

describe("groupOverviewOutputs", () => {
  it("ranks mph and distance higher-is-better", () => {
    const rows: OverviewOutput[] = [
      {
        athlete_id: "slow",
        first_name: "S",
        last_name: "Low",
        movement_name: "5-15yd",
        drill_label: "5-15yd",
        kind: "output",
        load: 11,
        reps: null,
        units: "mph",
        raw_text: "1.8s",
        session_date: "2026-09-14",
      },
      {
        athlete_id: "fast",
        first_name: "F",
        last_name: "Ast",
        movement_name: "5-15yd",
        drill_label: "5-15yd",
        kind: "output",
        load: 13,
        reps: null,
        units: "mph",
        raw_text: "1.5s",
        session_date: "2026-09-14",
      },
      {
        athlete_id: "short",
        first_name: "S",
        last_name: "Hort",
        movement_name: "CMJ",
        kind: "output",
        load: 20,
        reps: null,
        units: "in",
        raw_text: "20 in",
        session_date: "2026-09-14",
      },
      {
        athlete_id: "tall",
        first_name: "T",
        last_name: "All",
        movement_name: "CMJ",
        kind: "output",
        load: 24,
        reps: null,
        units: "in",
        raw_text: "24 in",
        session_date: "2026-09-14",
      },
    ];

    const groups = groupOverviewOutputs(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("5-15yd");
    expect(groups[0].rows.map((r) => r.athlete_id)).toEqual(["fast", "slow"]);
    expect(groups[1].label).toBe("CMJ");
    expect(groups[1].rows.map((r) => r.athlete_id)).toEqual(["tall", "short"]);
  });
});

describe("Jump-Mat CMJ unknown parse", () => {
  it("coerces bare raw_text heights into ranked inch outputs", () => {
    const jump: ReportMovement = { id: "mov-jump", name: "Jump-Mat: CMJ" };
    const report = aggregateWeightRoomReport({
      hugo_group: "volleyball",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [
        { id: "a1", first_name: "Ava", last_name: "Carr" },
        { id: "a2", first_name: "Addie", last_name: "Kinley" },
      ],
      movements: [jump],
      logs: [
        {
          id: "log-ava",
          athlete_id: "a1",
          template_id: "t",
          session_date: "2026-09-09",
          hugo_group: "volleyball",
        },
        {
          id: "log-addie",
          athlete_id: "a2",
          template_id: "t",
          session_date: "2026-09-09",
          hugo_group: "volleyball",
        },
      ],
      results: [
        {
          session_log_id: "log-ava",
          movement_id: jump.id,
          raw_text: "19.6",
          kind: "unknown",
          load: null,
          reps: null,
          units: null,
        },
        {
          session_log_id: "log-addie",
          movement_id: jump.id,
          raw_text: "13.9",
          kind: "unknown",
          load: null,
          reps: null,
          units: null,
        },
      ],
    });

    const overview = buildWeightRoomOverview(report, []);
    const group = overview.outputGroups.find((g) => g.label === "Jump-Mat: CMJ");
    expect(group).toBeDefined();
    expect(group!.units).toBe("in");
    expect(group!.rows.map((r) => r.athlete_id)).toEqual(["a1", "a2"]);
    expect(group!.rows[0]).toMatchObject({ load: 19.6, units: "in" });
    expect(group!.rows[1]).toMatchObject({ load: 13.9, units: "in" });
  });
});
