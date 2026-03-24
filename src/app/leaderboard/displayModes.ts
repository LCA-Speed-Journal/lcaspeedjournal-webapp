import type { LeaderboardRow } from "@/types";

export const TOP_N_MIN = 1;
export const TOP_N_MAX = 50;
const TOP_N_DEFAULT = 10;

type Section<T> = { title: string; rows: T[] };
export type GenderColumnSection<T> = { title: string; rows: T[] };

export function clampTopN(value: number): number {
  if (!Number.isFinite(value)) return TOP_N_DEFAULT;
  return Math.min(TOP_N_MAX, Math.max(TOP_N_MIN, Math.floor(value)));
}

export function applyTopN<T>(rows: T[], topN: number, enabled: boolean): T[] {
  if (!enabled) return rows;
  const n = clampTopN(topN);
  return rows.slice(0, n);
}

export function applyTopNToSections<T>(
  sections: Section<T>[],
  topN: number,
  enabled: boolean
): Section<T>[] {
  return sections.map((section) => ({
    ...section,
    rows: applyTopN(section.rows, topN, enabled),
  }));
}

export function getGridClass({ wideMode }: { wideMode: boolean }): string {
  return wideMode
    ? "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5"
    : "grid grid-cols-2 gap-3 sm:grid-cols-3";
}

export function buildGenderColumnModel(options: {
  male: LeaderboardRow[];
  female: LeaderboardRow[];
  topN: number;
  topNEnabled: boolean;
}): { male: LeaderboardRow[]; female: LeaderboardRow[] } {
  const { male, female, topN, topNEnabled } = options;
  return {
    male: applyTopN(male, topN, topNEnabled),
    female: applyTopN(female, topN, topNEnabled),
  };
}

export function buildGenderColumnsFromSections<T>(sections: Section<T>[]): {
  boys: GenderColumnSection<T>[];
  girls: GenderColumnSection<T>[];
} {
  const boys: GenderColumnSection<T>[] = [];
  const girls: GenderColumnSection<T>[] = [];

  for (const section of sections) {
    if (section.title === "Boys") {
      boys.push({ title: "", rows: section.rows });
      continue;
    }
    if (section.title === "Girls") {
      girls.push({ title: "", rows: section.rows });
      continue;
    }
    if (section.title.endsWith("(Boys)")) {
      boys.push({ title: section.title.replace(/\s*\(Boys\)$/, ""), rows: section.rows });
      continue;
    }
    if (section.title.endsWith("(Girls)")) {
      girls.push({ title: section.title.replace(/\s*\(Girls\)$/, ""), rows: section.rows });
    }
  }

  return { boys, girls };
}
