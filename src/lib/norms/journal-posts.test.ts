import { describe, it, expect } from "vitest";
import {
  buildJournalPostCandidates,
  applyJournalPosts,
  type JournalMovement,
  type CellOutput,
} from "./journal-posts";

const cmj: JournalMovement = {
  id: "mov-cmj",
  name: "CMJ (Vertical Jump)",
  speed_journal_metric_key: "Vertical Jump",
};
const submax: JournalMovement = {
  id: "mov-sub",
  name: "CMJ (Vertical Jump) — Submax",
  speed_journal_metric_key: null,
};
const unmappedOut: JournalMovement = {
  id: "mov-bj",
  name: "Broad Jump",
  speed_journal_metric_key: null,
};

const outputs: CellOutput[] = [
  { movement_id: "mov-cmj", kind: "output", load: 20, units: "in" },
  { movement_id: "mov-cmj", kind: "output", load: 22.5, units: "in" },
  { movement_id: "mov-sub", kind: "output", load: 18, units: "in" },
  { movement_id: "mov-bj", kind: "output", load: 8, units: "ft" },
  { movement_id: "mov-cmj", kind: "load_reps", load: 185, units: "lb" },
];

describe("buildJournalPostCandidates", () => {
  it("pre-checks mapped best output only", () => {
    const rows = buildJournalPostCandidates({
      movements: [cmj, submax, unmappedOut],
      outputs,
      lowerIsBetterFor: () => false,
    });
    const mapped = rows.find((r) => r.movement_id === "mov-cmj");
    expect(mapped).toMatchObject({
      metric_key: "Vertical Jump",
      best_value: 22.5,
      units: "in",
      suggested_post: true,
      mapped: true,
    });
    // Unmapped + output is a candidate regardless of name (no Submax regex).
    const sub = rows.find((r) => r.movement_id === "mov-sub");
    expect(sub).toMatchObject({
      mapped: false,
      suggested_post: false,
      metric_key: null,
      best_value: 18,
    });
    const bj = rows.find((r) => r.movement_id === "mov-bj");
    expect(bj).toMatchObject({
      mapped: false,
      suggested_post: false,
      best_value: 8,
    });
  });

  it("omits mapped movement with no output", () => {
    const rows = buildJournalPostCandidates({
      movements: [cmj],
      outputs: [],
      lowerIsBetterFor: () => false,
    });
    expect(rows).toEqual([
      expect.objectContaining({
        movement_id: "mov-cmj",
        mapped: true,
        suggested_post: false,
        best_value: null,
      }),
    ]);
  });

  it("omits unmapped movement with no output", () => {
    const rows = buildJournalPostCandidates({
      movements: [unmappedOut],
      outputs: [],
      lowerIsBetterFor: () => false,
    });
    expect(rows).toEqual([]);
  });

  it("picks min load when lowerIsBetterFor is true", () => {
    const rows = buildJournalPostCandidates({
      movements: [cmj],
      outputs: [
        { movement_id: "mov-cmj", kind: "output", load: 5.1, units: "s" },
        { movement_id: "mov-cmj", kind: "output", load: 4.8, units: "s" },
      ],
      lowerIsBetterFor: () => true,
    });
    expect(rows[0]).toMatchObject({
      best_value: 4.8,
      units: "s",
      suggested_post: true,
    });
  });
});

describe("applyJournalPosts", () => {
  it("keeps only post true with a value", () => {
    const candidates = buildJournalPostCandidates({
      movements: [cmj, unmappedOut],
      outputs,
      lowerIsBetterFor: () => false,
    });
    const posted = applyJournalPosts(candidates, [
      { movement_id: "mov-cmj", metric_key: "Vertical Jump", post: true },
      { movement_id: "mov-bj", metric_key: "Standing-Broad", post: true },
    ]);
    expect(posted).toHaveLength(2);
    expect(posted.map((p) => p.metric_key).sort()).toEqual([
      "Standing-Broad",
      "Vertical Jump",
    ]);
  });

  it("skips post false even when mapped", () => {
    const candidates = buildJournalPostCandidates({
      movements: [cmj],
      outputs,
      lowerIsBetterFor: () => false,
    });
    expect(
      applyJournalPosts(candidates, [
        { movement_id: "mov-cmj", metric_key: "Vertical Jump", post: false },
      ])
    ).toEqual([]);
  });

  it("skips post true when best_value is null", () => {
    const candidates = buildJournalPostCandidates({
      movements: [cmj],
      outputs: [],
      lowerIsBetterFor: () => false,
    });
    expect(
      applyJournalPosts(candidates, [
        { movement_id: "mov-cmj", metric_key: "Vertical Jump", post: true },
      ])
    ).toEqual([]);
  });
});
