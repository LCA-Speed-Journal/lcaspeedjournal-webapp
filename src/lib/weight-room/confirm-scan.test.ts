import { describe, it, expect } from "vitest";
import { buildConfirmPayload } from "./confirm-scan";
import type { ParsedLoadReps } from "@/types/weight-room";

const MOVEMENT_ID = "11111111-1111-4111-8111-111111111111";
const ATHLETE_ID = "22222222-2222-4222-8222-222222222222";
const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";
const SCAN_ID = "44444444-4444-4444-8444-444444444444";

function cellKey(movementId: string, setIndex: number): string {
  return `${movementId}:${setIndex}`;
}

function parsed(raw: string, extra: Partial<ParsedLoadReps> = {}): ParsedLoadReps {
  return {
    raw,
    kind: "unknown",
    load: null,
    reps: null,
    units: null,
    ...extra,
  };
}

function baseScan(overrides: Record<string, unknown> = {}) {
  const cells = {
    [cellKey(MOVEMENT_ID, 0)]: "185x5",
    [cellKey(MOVEMENT_ID, 1)]: "195x5",
  };
  return {
    id: SCAN_ID,
    athlete_id: ATHLETE_ID,
    template_id: TEMPLATE_ID,
    status: "needs_review",
    extraction: {
      cells,
      parsed: {
        [cellKey(MOVEMENT_ID, 0)]: parsed("185x5", {
          kind: "load_reps",
          load: 185,
          reps: 5,
          units: "lb",
        }),
        [cellKey(MOVEMENT_ID, 1)]: parsed("195x5", {
          kind: "load_reps",
          load: 195,
          reps: 5,
          units: "lb",
        }),
      },
      warnings: [] as string[],
    },
    ...overrides,
  };
}

function baseTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_ID,
    session_date: "2026-08-24",
    hugo_group: "extracurricular",
    movements: [{ id: MOVEMENT_ID, set_count: 2 }],
    ...overrides,
  };
}

describe("buildConfirmPayload", () => {
  it("emits two set_results for one movement with two sets", () => {
    const result = buildConfirmPayload({
      scan: baseScan(),
      template: baseTemplate(),
      editedCells: {
        [cellKey(MOVEMENT_ID, 0)]: "185x5",
        [cellKey(MOVEMENT_ID, 1)]: "195x5",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      movement_id: MOVEMENT_ID,
      set_index: 0,
      raw_text: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
      units: "lb",
      corrected: false,
    });
    expect(result.results[1]).toMatchObject({
      movement_id: MOVEMENT_ID,
      set_index: 1,
      raw_text: "195x5",
      kind: "load_reps",
      load: 195,
      reps: 5,
      units: "lb",
      corrected: false,
    });
    expect(result.log).toMatchObject({
      athlete_id: ATHLETE_ID,
      template_id: TEMPLATE_ID,
      scan_id: SCAN_ID,
      session_date: "2026-08-24",
      hugo_group: "extracurricular",
    });
  });

  it("sets corrected true when edited raw differs from extraction", () => {
    const result = buildConfirmPayload({
      scan: baseScan(),
      template: baseTemplate(),
      editedCells: {
        [cellKey(MOVEMENT_ID, 0)]: "185x5",
        [cellKey(MOVEMENT_ID, 1)]: "205x3",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0].corrected).toBe(false);
    expect(result.results[1]).toMatchObject({
      set_index: 1,
      raw_text: "205x3",
      kind: "load_reps",
      load: 205,
      reps: 3,
      units: "lb",
      corrected: true,
    });
  });

  it("returns ok false when athlete_id is missing", () => {
    const result = buildConfirmPayload({
      scan: baseScan({ athlete_id: null }),
      template: baseTemplate(),
      editedCells: {
        [cellKey(MOVEMENT_ID, 0)]: "185x5",
        [cellKey(MOVEMENT_ID, 1)]: "195x5",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/athlete/i);
  });

  it("returns ok false when template_id is missing", () => {
    const result = buildConfirmPayload({
      scan: baseScan({ template_id: null }),
      template: baseTemplate(),
      editedCells: {
        [cellKey(MOVEMENT_ID, 0)]: "185x5",
        [cellKey(MOVEMENT_ID, 1)]: "195x5",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/template/i);
  });
});
