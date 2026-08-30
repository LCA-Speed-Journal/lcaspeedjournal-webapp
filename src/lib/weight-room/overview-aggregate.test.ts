import { describe, it, expect } from "vitest";
import { aggregateWeightRoomReport } from "./report-aggregate";
import { buildWeightRoomOverview } from "./overview-aggregate";

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
});
