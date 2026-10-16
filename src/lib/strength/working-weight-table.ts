import { listBaselines } from "@/lib/strength/baselines";
import type { StrengthPattern } from "@/lib/strength/exercises";
import { loadStrengthSeries } from "@/lib/strength/load-sets";
import { buildWorkingWeights } from "@/lib/strength/working-weights";
import { loadTeamProgressRoster } from "@/lib/team-progress/load";
import { getTemplateWithMovements } from "@/lib/weight-room/insert-template";

export type WorkingWeightTableCell = {
  athlete_id: string;
  kind: "load" | "ceiling" | null;
  pounds: number | null;
};

export type WorkingWeightTableData = {
  session_date: string;
  athletes: Array<{
    athlete_id: string;
    first_name: string;
    last_name: string;
  }>;
  rows: Array<{
    name: string;
    cells: WorkingWeightTableCell[];
  }>;
};

export type LoadWorkingWeightTableResult =
  | { ok: true; data: WorkingWeightTableData }
  | { ok: false; status: 404; error: string };

/**
 * Loads one extracurricular template's suggested loads.
 * A missing template, or any other Hugo group, is a 404.
 * Database reads stay here so buildWorkingWeights stays pure.
 */
export async function loadWorkingWeightTable(
  templateId: string
): Promise<LoadWorkingWeightTableResult> {
  const template = await getTemplateWithMovements(templateId);
  if (!template || template.hugo_group !== "extracurricular") {
    return { ok: false, status: 404, error: "Template not found" };
  }

  const [roster, series, baselineRows] = await Promise.all([
    loadTeamProgressRoster("extracurricular"),
    loadStrengthSeries({
      hugoGroup: "extracurricular",
      from: "2000-01-01",
      to: template.session_date,
    }),
    listBaselines({ hugoGroup: "extracurricular" }),
  ]);

  const patternsByAthlete = new Map(
    series.athletes.map((athlete) => [athlete.athlete_id, athlete.patterns])
  );
  const baselinesByAthlete = new Map<
    string,
    Partial<Record<StrengthPattern, number>>
  >();
  for (const row of baselineRows) {
    const current = baselinesByAthlete.get(row.athlete_id) ?? {};
    current[row.pattern] = row.value_lb;
    baselinesByAthlete.set(row.athlete_id, current);
  }

  const built = buildWorkingWeights({
    sessionDate: template.session_date,
    movements: template.movements.map((movement) => ({
      name: movement.name,
      targets: movement.targets,
      set_count: movement.set_count,
    })),
    athletes: roster.map((athlete) => ({
      athleteId: athlete.id,
      patterns: (patternsByAthlete.get(athlete.id) ?? []).map((pattern) => ({
        pattern: pattern.pattern,
        points: pattern.points.map((point) => ({
          date: point.date,
          referenceE1rm: point.reference_e1rm,
        })),
      })),
      baselines: baselinesByAthlete.get(athlete.id) ?? {},
    })),
  });

  return {
    ok: true,
    data: {
      session_date: template.session_date,
      athletes: roster.map((athlete) => ({
        athlete_id: athlete.id,
        first_name: athlete.first_name,
        last_name: athlete.last_name,
      })),
      rows: built.map((row) => ({
        name: row.name,
        cells: row.cells.map((cell) => ({
          athlete_id: cell.athleteId,
          kind: cell.value == null ? null : cell.value.kind,
          pounds: cell.value == null ? null : cell.value.pounds,
        })),
      })),
    },
  };
}
