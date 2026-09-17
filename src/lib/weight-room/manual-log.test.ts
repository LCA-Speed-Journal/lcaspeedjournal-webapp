import { describe, it, expect } from "vitest";
import {
  resolveAthleteCell,
  buildManualLogAthletePayload,
  buildGridRowsFromTemplate,
  buildWarmupExpandInserts,
  buildTempIdRemap,
  remapCellKeys,
} from "./manual-log";
import { splitWarmupDrills } from "./split-warmup-drills";

const MOVEMENT_ID = "11111111-1111-4111-8111-111111111111";
const WARMUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATHLETE_A = "22222222-2222-4222-8222-222222222222";
const ATHLETE_B = "33333333-3333-4333-8333-333333333333";
const TEMPLATE_ID = "44444444-4444-4444-8444-444444444444";

describe("resolveAthleteCell", () => {
  it("inherits default when override is undefined", () => {
    expect(resolveAthleteCell("45s/leg", undefined)).toBe("45s/leg");
  });

  it("uses override when typed", () => {
    expect(resolveAthleteCell("45s/leg", "60s/leg")).toBe("60s/leg");
  });

  it("cleared override means skip (null)", () => {
    expect(resolveAthleteCell("45s/leg", "")).toBeNull();
  });
});

describe("buildGridRowsFromTemplate", () => {
  it("expands zero-set warmup notes into drill rows and keeps set rows", () => {
    const rows = buildGridRowsFromTemplate([
      {
        id: WARMUP_ID,
        name: "Warmup Circuit",
        block: "Warmup",
        set_count: 0,
        targets: [],
        notes: "Spring ankle (bent-knee) 45s/leg · hip hike 15/side",
        label: "W",
      },
      {
        id: MOVEMENT_ID,
        name: "Goblet Squat",
        block: "Main",
        set_count: 2,
        targets: ["50x8", "55x8"],
        notes: "",
        label: "1",
      },
    ]);

    expect(rows.filter((r) => r.source === "warmup_expand")).toHaveLength(2);
    expect(rows.some((r) => r.movementId === MOVEMENT_ID && r.setIndex === 0)).toBe(true);
    expect(rows.find((r) => r.defaultText === "45s/leg")?.name).toContain("Spring ankle");
  });
});

describe("buildWarmupExpandInserts", () => {
  it("maps drills to MovementInsertInput with sequential sort_index", () => {
    const drills = splitWarmupDrills(
      "Spring ankle (bent-knee) 45s/leg · hip hike 15/side"
    );
    const inserts = buildWarmupExpandInserts(drills, 10);

    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toEqual({
      sort_index: 10,
      label: "W",
      name: "Spring ankle (bent-knee)",
      block: "Warmup",
      set_count: 1,
      targets: ["45s/leg"],
      notes: "",
      from_pair: false,
      speed_journal_metric_key: null,
      speed_journal_component: null,
    });
    expect(inserts[1]).toMatchObject({
      sort_index: 11,
      label: "W",
      name: "hip hike",
      set_count: 1,
      targets: ["15/side"],
      block: "Warmup",
    });
  });

  it("uses empty string target when dose is missing", () => {
    const inserts = buildWarmupExpandInserts(
      [{ name: "Prime-times", dose: "" }],
      0,
      "Prep"
    );
    expect(inserts[0]).toMatchObject({
      sort_index: 0,
      name: "Prime-times",
      block: "Prep",
      targets: [""],
      set_count: 1,
      label: "W",
    });
  });
});

describe("buildTempIdRemap", () => {
  it("maps client temp ids to inserted ids by index", () => {
    const remap = buildTempIdRemap(
      ["temp-warmup-1", "temp-warmup-2", null],
      ["aaaa", "bbbb", "cccc"]
    );
    expect(remap.get("temp-warmup-1")).toBe("aaaa");
    expect(remap.get("temp-warmup-2")).toBe("bbbb");
    expect(remap.has("temp-warmup-3")).toBe(false);
    expect(remap.size).toBe(2);
  });

  it("skips empty or whitespace temp ids", () => {
    const remap = buildTempIdRemap(["", "  ", "temp-1"], ["a", "b", "c"]);
    expect(remap.size).toBe(1);
    expect(remap.get("temp-1")).toBe("c");
  });
});

describe("remapCellKeys", () => {
  it("rewrites movementId portion when present in remap", () => {
    const remap = new Map([
      ["temp-warmup-1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ]);
    const cells = {
      "temp-warmup-1:0": "45s/leg",
      [`${MOVEMENT_ID}:0`]: "185x5",
      "temp-warmup-1:1": "60s",
    };
    expect(remapCellKeys(remap, cells)).toEqual({
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:0": "45s/leg",
      [`${MOVEMENT_ID}:0`]: "185x5",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:1": "60s",
    });
  });

  it("leaves keys unchanged when movementId is not in remap", () => {
    const remap = new Map([["temp-other", "bbbb"]]);
    const cells = { "temp-warmup-1:0": "45s/leg", [`${MOVEMENT_ID}:1`]: "x" };
    expect(remapCellKeys(remap, cells)).toEqual(cells);
  });

  it("leaves keys without a colon unchanged", () => {
    const remap = new Map([["temp-warmup-1", "aaaa"]]);
    expect(remapCellKeys(remap, { orphan: "v" })).toEqual({ orphan: "v" });
  });
});

describe("buildManualLogAthletePayload", () => {
  it("builds confirm-compatible results with scan_id null for two athletes", () => {
    const movements = [{ id: MOVEMENT_ID, set_count: 1 }];
    const defaults: Record<string, string> = { [`${MOVEMENT_ID}:0`]: "185x5" };
    const batch = buildManualLogAthletePayload({
      templateId: TEMPLATE_ID,
      sessionDate: "2026-09-17",
      hugoGroup: "extracurricular",
      movements,
      defaults,
      athletes: [
        { athleteId: ATHLETE_A, cells: {} },
        { athleteId: ATHLETE_B, cells: { [`${MOVEMENT_ID}:0`]: "195x5" } },
      ],
    });

    expect(batch).toHaveLength(2);
    expect(batch[0]!.log.scan_id).toBeNull();
    expect(batch[0]!.results[0]).toMatchObject({
      raw_text: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
    });
    expect(batch[1]!.results[0]).toMatchObject({
      raw_text: "195x5",
      load: 195,
    });
  });

  it("omits cleared cells as null raw_text", () => {
    const batch = buildManualLogAthletePayload({
      templateId: TEMPLATE_ID,
      sessionDate: "2026-09-17",
      hugoGroup: "extracurricular",
      movements: [{ id: MOVEMENT_ID, set_count: 1 }],
      defaults: { [`${MOVEMENT_ID}:0`]: "185x5" },
      athletes: [{ athleteId: ATHLETE_A, cells: { [`${MOVEMENT_ID}:0`]: "" } }],
    });
    expect(batch[0]!.results[0]!.raw_text).toBeNull();
  });
});
