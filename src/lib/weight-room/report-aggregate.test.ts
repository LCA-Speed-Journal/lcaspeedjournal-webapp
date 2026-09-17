import { describe, it, expect } from "vitest";
import {
  aggregateWeightRoomReport,
  isWeightRoomReportRangeTooLong,
  journalSpeedMarkMph,
  mergeJournalAttendance,
  mergeJournalSpeedMarks,
  resolveSpeedDrillYards,
} from "./report-aggregate";
import type {
  JournalSpeedMark,
  ReportAggregateInput,
  ReportAthlete,
  ReportLog,
  ReportMovement,
  ReportResult,
} from "./report-aggregate";
import { mphFromYardSplit } from "@/lib/norms/forty-yd";

const ada: ReportAthlete = {
  id: "athlete-ada",
  first_name: "Ada",
  last_name: "Lovelace",
};
const alan: ReportAthlete = {
  id: "athlete-alan",
  first_name: "Alan",
  last_name: "Turing",
};

const squat: ReportMovement = { id: "mov-squat", name: "Back Squat" };
const bench: ReportMovement = { id: "mov-bench", name: "Bench Press" };
const cmj: ReportMovement = { id: "mov-cmj", name: "CMJ" };
const rmTest: ReportMovement = { id: "mov-rm", name: "Trap Bar 1RM" };

function log(
  id: string,
  athlete_id: string,
  session_date: string,
  template_id = `tmpl-${id}`
): ReportLog {
  return {
    id,
    athlete_id,
    template_id,
    session_date,
    hugo_group: "soccer",
  };
}

function result(
  partial: Omit<ReportResult, "units"> & { units?: string | null }
): ReportResult {
  return { units: null, ...partial };
}

describe("aggregateWeightRoomReport", () => {
  it("counts attendance as distinct confirmed session dates per athlete", () => {
    const input: ReportAggregateInput = {
      hugo_group: "soccer",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [ada, alan],
      movements: [squat, bench],
      logs: [
        log("log-ada-mon-a", ada.id, "2026-09-08"),
        log("log-ada-mon-b", ada.id, "2026-09-08"),
        log("log-ada-wed", ada.id, "2026-09-10"),
        log("log-alan-mon", alan.id, "2026-09-08"),
      ],
      results: [
        result({
          session_log_id: "log-ada-mon-a",
          movement_id: squat.id,
          raw_text: "185x5",
          kind: "load_reps",
          load: 185,
          reps: 5,
        }),
        result({
          session_log_id: "log-ada-mon-b",
          movement_id: bench.id,
          raw_text: "135x8",
          kind: "load_reps",
          load: 135,
          reps: 8,
        }),
        result({
          session_log_id: "log-ada-wed",
          movement_id: squat.id,
          raw_text: "195x3",
          kind: "load_reps",
          load: 195,
          reps: 3,
        }),
        result({
          session_log_id: "log-alan-mon",
          movement_id: squat.id,
          raw_text: "225x3",
          kind: "load_reps",
          load: 225,
          reps: 3,
        }),
      ],
    };

    const report = aggregateWeightRoomReport(input);

    expect(report.hugo_group).toBe("soccer");
    expect(report.from).toBe("2026-09-08");
    expect(report.to).toBe("2026-09-14");
    expect(report.sessionDates).toEqual(["2026-09-08", "2026-09-10"]);
    expect(report.attendanceByDate).toEqual([
      { session_date: "2026-09-08", count: 2 },
      { session_date: "2026-09-10", count: 1 },
    ]);

    const adaRow = report.athletes.find((a) => a.athlete_id === ada.id);
    const alanRow = report.athletes.find((a) => a.athlete_id === alan.id);
    expect(adaRow?.daysPresent).toBe(2);
    expect(alanRow?.daysPresent).toBe(1);
    expect(adaRow?.movementsTrained).toEqual(["Back Squat", "Bench Press"]);
    expect(adaRow?.bestLoad).toBe(195);
    expect(alanRow?.bestLoad).toBe(225);
    expect(adaRow?.priorWeekBestLoad).toBeNull();
  });

  it("sums parsed reps as volume and ignores unknown kinds", () => {
    const input: ReportAggregateInput = {
      hugo_group: "soccer",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [ada],
      movements: [squat, bench, cmj, rmTest],
      logs: [log("log-1", ada.id, "2026-09-08")],
      results: [
        result({
          session_log_id: "log-1",
          movement_id: squat.id,
          raw_text: "185x5",
          kind: "load_reps",
          load: 185,
          reps: 5,
        }),
        result({
          session_log_id: "log-1",
          movement_id: squat.id,
          raw_text: "AMRAP 12",
          kind: "amrap",
          load: null,
          reps: 12,
        }),
        result({
          session_log_id: "log-1",
          movement_id: squat.id,
          raw_text: "felt good",
          kind: "unknown",
          load: null,
          reps: 8,
        }),
        result({
          session_log_id: "log-1",
          movement_id: squat.id,
          raw_text: "BW",
          kind: "bw",
          load: null,
          reps: null,
        }),
        result({
          session_log_id: "log-1",
          movement_id: squat.id,
          raw_text: "",
          kind: null,
          load: null,
          reps: null,
        }),
        result({
          session_log_id: "log-1",
          movement_id: squat.id,
          raw_text: null,
          kind: "load_reps",
          load: 400,
          reps: 99,
        }),
        result({
          session_log_id: "log-1",
          movement_id: cmj.id,
          raw_text: "22.5 in",
          kind: "output",
          load: 22.5,
          reps: null,
          units: "in",
        }),
        result({
          session_log_id: "log-1",
          movement_id: rmTest.id,
          raw_text: "315x1",
          kind: "load_reps",
          load: 315,
          reps: 1,
        }),
      ],
      priorResults: [
        result({
          session_log_id: "prior-1",
          movement_id: squat.id,
          raw_text: "205x5",
          kind: "load_reps",
          load: 205,
          reps: 5,
        }),
      ],
      priorLogs: [log("prior-1", ada.id, "2026-09-03")],
    };

    const report = aggregateWeightRoomReport(input);
    const row = report.athletes[0];

    expect(row.parsedVolume).toBe(18);
    expect(row.setsLogged).toBe(6);
    expect(row.bestLoad).toBe(315);
    expect(row.priorWeekBestLoad).toBe(205);
    expect(row.movementsTrained).toEqual([
      "Back Squat",
      "CMJ",
      "Trap Bar 1RM",
    ]);
    expect(row.outputs).toEqual([
      expect.objectContaining({
        movement_name: "CMJ",
        kind: "output",
        load: 22.5,
        raw_text: "22.5 in",
      }),
      expect.objectContaining({
        movement_name: "Trap Bar 1RM",
        kind: "load_reps",
        load: 315,
        raw_text: "315x1",
      }),
    ]);
  });

  it("returns empty athletes array when there are no logs", () => {
    const report = aggregateWeightRoomReport({
      hugo_group: "mens_basketball",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [ada, alan],
      movements: [squat],
      logs: [],
      results: [
        result({
          session_log_id: "orphan",
          movement_id: squat.id,
          raw_text: "185x5",
          kind: "load_reps",
          load: 185,
          reps: 5,
        }),
      ],
    });

    expect(report.athletes).toEqual([]);
    expect(report.sessionDates).toEqual([]);
    expect(report.attendanceByDate).toEqual([]);
    expect(report.hugo_group).toBe("mens_basketball");
    expect(report.from).toBe("2026-09-08");
    expect(report.to).toBe("2026-09-14");
  });

  it("does not treat Warmup or Arm as test outputs", () => {
    const warmup: ReportMovement = { id: "mov-wu", name: "Warmup Circuit" };
    const armRow: ReportMovement = { id: "mov-arm", name: "1-Arm DB Row" };
    const cmjOnly: ReportMovement = { id: "mov-cmj-name", name: "CMJ" };
    const inches: ReportMovement = { id: "mov-inch", name: "Broad Jump" };

    const report = aggregateWeightRoomReport({
      hugo_group: "soccer",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [ada],
      movements: [warmup, armRow, cmjOnly, inches],
      logs: [log("log-out", ada.id, "2026-09-08")],
      results: [
        result({
          session_log_id: "log-out",
          movement_id: warmup.id,
          raw_text: "95x8",
          kind: "load_reps",
          load: 95,
          reps: 8,
        }),
        result({
          session_log_id: "log-out",
          movement_id: armRow.id,
          raw_text: "50x10",
          kind: "load_reps",
          load: 50,
          reps: 10,
        }),
        result({
          session_log_id: "log-out",
          movement_id: cmjOnly.id,
          raw_text: "22 in",
          kind: "load_reps",
          load: 22,
          reps: null,
        }),
        result({
          session_log_id: "log-out",
          movement_id: inches.id,
          raw_text: "8.5 in",
          kind: "output",
          load: 8.5,
          reps: null,
          units: "in",
        }),
      ],
    });

    const names = report.athletes[0].outputs.map((o) => o.movement_name);
    expect(names).not.toContain("Warmup Circuit");
    expect(names).not.toContain("1-Arm DB Row");
    expect(names).toContain("CMJ");
    expect(names).toContain("Broad Jump");
  });

  it("counts Speed Journal testing days toward weekly attendance", () => {
    const source = mergeJournalAttendance(
      {
        logs: [log("log-scan", ada.id, "2026-09-08")],
        results: [],
        movements: [],
        athletes: [ada],
      },
      [
        {
          athlete_id: ada.id,
          session_date: "2026-09-04",
          first_name: "Ada",
          last_name: "Lovelace",
        },
        {
          athlete_id: ada.id,
          session_date: "2026-09-08",
          first_name: "Ada",
          last_name: "Lovelace",
        },
        {
          athlete_id: alan.id,
          session_date: "2026-09-02",
          first_name: "Alan",
          last_name: "Turing",
        },
      ],
      "soccer"
    );

    const report = aggregateWeightRoomReport({
      hugo_group: "soccer",
      from: "2026-09-01",
      to: "2026-09-07",
      ...source,
    });

    expect(report.sessionDates).toEqual([
      "2026-09-02",
      "2026-09-04",
      "2026-09-08",
    ]);
    expect(report.attendanceByDate).toEqual([
      { session_date: "2026-09-02", count: 1 },
      { session_date: "2026-09-04", count: 1 },
      { session_date: "2026-09-08", count: 1 },
    ]);
    expect(report.athletes.find((a) => a.athlete_id === ada.id)?.daysPresent).toBe(
      2
    );
    expect(report.athletes.find((a) => a.athlete_id === alan.id)?.daysPresent).toBe(
      1
    );
  });

  it("rejects PDF ranges longer than 12 weeks and allows 84 days", () => {
    expect(isWeightRoomReportRangeTooLong("2026-01-01", "2026-03-26")).toBe(false);
    expect(isWeightRoomReportRangeTooLong("2026-01-01", "2026-03-27")).toBe(true);
  });

  it("converts timed 5-15yd set_results to best mph in Outputs", () => {
    const fly: ReportMovement = {
      id: "mov-515",
      name: "5-15yd Fly",
      speed_journal_metric_key: "40yd_Dash",
      speed_journal_component: "5-15yd",
    };
    expect(resolveSpeedDrillYards(fly)).toBe(10);

    const report = aggregateWeightRoomReport({
      hugo_group: "volleyball",
      from: "2026-09-08",
      to: "2026-09-14",
      athletes: [ada],
      movements: [fly],
      logs: [
        log("log-slow", ada.id, "2026-09-14"),
        log("log-fast", ada.id, "2026-09-14", "tmpl-b"),
      ],
      results: [
        result({
          session_log_id: "log-slow",
          movement_id: fly.id,
          raw_text: "1.80s",
          kind: "duration",
          load: 1.8,
          reps: null,
          units: "s",
        }),
        result({
          session_log_id: "log-fast",
          movement_id: fly.id,
          raw_text: "1.68s",
          kind: "duration",
          load: 1.68,
          reps: null,
          units: "s",
        }),
      ],
    });

    const expected = Math.round((mphFromYardSplit(1.68, 10) ?? 0) * 100) / 100;
    expect(report.athletes[0].outputs).toEqual([
      expect.objectContaining({
        movement_name: "5-15yd",
        drill_label: "5-15yd",
        units: "mph",
        load: expected,
        raw_text: "1.68s",
      }),
    ]);
  });

  it("merges Speed Journal 5-15yd entries into Outputs as mph", () => {
    const mark: JournalSpeedMark = {
      athlete_id: ada.id,
      session_date: "2026-09-14",
      first_name: "Ada",
      last_name: "Lovelace",
      metric_key: "40yd_Dash",
      component: "5-15yd",
      value: 1.68,
      units: "s",
      raw_input: "1.68s",
    };
    expect(journalSpeedMarkMph(mark)).toBe(
      Math.round((mphFromYardSplit(1.68, 10) ?? 0) * 100) / 100
    );

    const merged = mergeJournalSpeedMarks(
      { logs: [], results: [], movements: [], athletes: [] },
      [mark],
      "volleyball"
    );
    const report = aggregateWeightRoomReport({
      hugo_group: "volleyball",
      from: "2026-09-08",
      to: "2026-09-14",
      ...merged,
    });

    expect(report.athletes[0].outputs).toEqual([
      expect.objectContaining({
        movement_name: "5-15yd",
        units: "mph",
        load: journalSpeedMarkMph(mark),
      }),
    ]);
  });
});
