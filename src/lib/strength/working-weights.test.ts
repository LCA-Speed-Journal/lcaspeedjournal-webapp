import { describe, expect, it } from "vitest";
import { suggestedLoad } from "./estimate";
import { buildWorkingWeights } from "./working-weights";

describe("buildWorkingWeights", () => {
  it("does not fill a hinge cell from a squat series point", () => {
    const rows = buildWorkingWeights({
      sessionDate: "2026-10-15",
      movements: [{ name: "BB RDL", targets: ["3 @ RPE 8"], set_count: 3 }],
      athletes: [
        {
          athleteId: "a1",
          patterns: [
            {
              pattern: "squat",
              points: [{ date: "2026-10-01", referenceE1rm: 300 }],
            },
          ],
          baselines: {},
        },
      ],
    });

    const cell = rows
      .find((row) => row.name === "BB RDL")
      ?.cells.find((entry) => entry.athleteId === "a1")?.value;
    expect(cell).toBeNull();
  });

  it("loads press from its point and pull from its own baseline", () => {
    const rows = buildWorkingWeights({
      sessionDate: "2026-10-15",
      movements: [
        { name: "DB Bench", targets: ["6 @ RPE 8"], set_count: 3 },
        { name: "Lat Pull Down", targets: ["6 @ RPE 8"], set_count: 3 },
      ],
      athletes: [
        {
          athleteId: "a1",
          patterns: [
            {
              pattern: "press",
              points: [{ date: "2026-10-01", referenceE1rm: 200 }],
            },
          ],
          baselines: { pull: 150 },
        },
      ],
    });

    const bench = rows
      .find((row) => row.name === "DB Bench")
      ?.cells.find((entry) => entry.athleteId === "a1")?.value;
    const pulldown = rows
      .find((row) => row.name === "Lat Pull Down")
      ?.cells.find((entry) => entry.athleteId === "a1")?.value;

    const fromPullBaseline = suggestedLoad({
      pattern: "pull",
      referenceE1rm: 150,
      movementName: "Lat Pull Down",
      reps: 6,
      rpe: 8,
    });
    const fromPressReference = suggestedLoad({
      pattern: "pull",
      referenceE1rm: 200,
      movementName: "Lat Pull Down",
      reps: 6,
      rpe: 8,
    });

    expect(bench).toEqual({ kind: "load", pounds: 55 });
    expect(pulldown).toEqual({ kind: "load", pounds: fromPullBaseline });
    expect(pulldown?.kind === "load" ? pulldown.pounds : null).not.toBe(fromPressReference);
  });

  it("marks a mapped RM attempt as a ceiling", () => {
    const rows = buildWorkingWeights({
      sessionDate: "2026-10-15",
      movements: [{ name: "Back Squat", targets: ["3RM"], set_count: 1 }],
      athletes: [
        {
          athleteId: "a1",
          patterns: [
            {
              pattern: "squat",
              points: [{ date: "2026-10-01", referenceE1rm: 240 }],
            },
          ],
          baselines: {},
        },
      ],
    });

    const cell = rows
      .find((row) => row.name === "Back Squat")
      ?.cells.find((entry) => entry.athleteId === "a1")?.value;
    expect(cell?.kind).toBe("ceiling");
    expect(cell?.kind).not.toBe("load");
  });

  it("prints an RM attempt as the ceiling when a warmup comes first", () => {
    const rows = buildWorkingWeights({
      sessionDate: "2026-10-15",
      movements: [
        {
          name: "Back Squat",
          targets: ["6\u20138 @ RPE 7", "1RM Attempt"],
          set_count: 4,
        },
      ],
      athletes: [
        {
          athleteId: "a1",
          patterns: [],
          baselines: { squat: 300 },
        },
      ],
    });

    const cell = rows
      .find((row) => row.name === "Back Squat")
      ?.cells.find((entry) => entry.athleteId === "a1")?.value;
    expect(cell).toEqual({ kind: "ceiling", pounds: 300 });
    expect(cell?.kind).not.toBe("load");
  });
});
