import { beforeEach, describe, expect, it, vi } from "vitest";

const getTemplateWithMovements = vi.fn();
const loadTeamProgressRoster = vi.fn();
const loadStrengthSeries = vi.fn();
const listBaselines = vi.fn();

vi.mock("@/lib/weight-room/insert-template", () => ({
  getTemplateWithMovements: (...args: unknown[]) =>
    getTemplateWithMovements(...args),
}));

vi.mock("@/lib/team-progress/load", () => ({
  loadTeamProgressRoster: (...args: unknown[]) =>
    loadTeamProgressRoster(...args),
}));

vi.mock("@/lib/strength/load-sets", () => ({
  loadStrengthSeries: (...args: unknown[]) => loadStrengthSeries(...args),
}));

vi.mock("@/lib/strength/baselines", () => ({
  listBaselines: (...args: unknown[]) => listBaselines(...args),
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { loadWorkingWeightTable } from "./working-weight-table";

const TEMPLATE_ID = "11111111-1111-1111-1111-111111111111";

describe("loadWorkingWeightTable", () => {
  beforeEach(() => {
    getTemplateWithMovements.mockReset();
    loadTeamProgressRoster.mockReset();
    loadStrengthSeries.mockReset();
    listBaselines.mockReset();
  });

  it("returns 404 when the template is missing", async () => {
    getTemplateWithMovements.mockResolvedValue(null);
    const result = await loadWorkingWeightTable(TEMPLATE_ID);
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Template not found",
    });
    expect(loadTeamProgressRoster).not.toHaveBeenCalled();
    expect(loadStrengthSeries).not.toHaveBeenCalled();
    expect(listBaselines).not.toHaveBeenCalled();
  });

  it("returns 404 for a football template and does not build a table", async () => {
    getTemplateWithMovements.mockResolvedValue({
      hugo_group: "football",
      session_date: "2026-10-15",
      movements: [
        { name: "Back Squat", targets: ["5 @ RPE 8"], set_count: 3 },
      ],
    });
    const result = await loadWorkingWeightTable(TEMPLATE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
    expect(loadTeamProgressRoster).not.toHaveBeenCalled();
    expect(loadStrengthSeries).not.toHaveBeenCalled();
    expect(listBaselines).not.toHaveBeenCalled();
  });

  it("maps series reference_e1rm and baselines onto every roster athlete", async () => {
    getTemplateWithMovements.mockResolvedValue({
      hugo_group: "extracurricular",
      session_date: "2026-10-15",
      movements: [{ name: "DB Bench", targets: ["6 @ RPE 8"], set_count: 3 }],
    });
    loadTeamProgressRoster.mockResolvedValue([
      { id: "a1", first_name: "Ada", last_name: "Lovelace", gender: null },
      { id: "a2", first_name: "Grace", last_name: "Hopper", gender: null },
    ]);
    loadStrengthSeries.mockResolvedValue({
      athletes: [
        {
          athlete_id: "a1",
          patterns: [
            {
              pattern: "press",
              reference_name: "Bench Press",
              points: [
                {
                  date: "2026-10-15",
                  reference_e1rm: 999,
                  source_movement: "Bench Press",
                  load: 200,
                  reps: 1,
                  rpe: 10,
                },
                {
                  date: "2026-10-01",
                  reference_e1rm: 200,
                  source_movement: "Bench Press",
                  load: 180,
                  reps: 5,
                  rpe: 8,
                },
              ],
            },
          ],
        },
      ],
    });
    listBaselines.mockResolvedValue([
      {
        athlete_id: "a2",
        pattern: "press",
        value_lb: 200,
        origin: "anchor",
      },
    ]);

    const result = await loadWorkingWeightTable(TEMPLATE_ID);
    expect(loadStrengthSeries).toHaveBeenCalledWith({
      hugoGroup: "extracurricular",
      from: "2000-01-01",
      to: "2026-10-15",
    });
    expect(listBaselines).toHaveBeenCalledWith({
      hugoGroup: "extracurricular",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.athletes).toEqual([
      { athlete_id: "a1", first_name: "Ada", last_name: "Lovelace" },
      { athlete_id: "a2", first_name: "Grace", last_name: "Hopper" },
    ]);
    expect(result.data.rows).toEqual([
      {
        name: "DB Bench",
        cells: [
          { athlete_id: "a1", kind: "load", pounds: 55 },
          { athlete_id: "a2", kind: "load", pounds: 55 },
        ],
      },
    ]);
  });
});
