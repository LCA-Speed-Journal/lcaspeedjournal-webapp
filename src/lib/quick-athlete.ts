export type AthleteCreateGender = "M" | "F";

export function parseNameFromQuery(query: string): { first: string; last: string } {
  const trimmed = query.trim();
  if (!trimmed) return { first: "", last: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { first: trimmed, last: "" };
  return {
    first: trimmed.slice(0, space).trim(),
    last: trimmed.slice(space + 1).trim(),
  };
}

export function schoolYearEnd(now: Date): number {
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? year + 1 : year;
}

export function gradeToGraduatingClass(
  grade: number,
  now: Date = new Date()
): number | null {
  if (grade !== 9 && grade !== 10 && grade !== 11 && grade !== 12) return null;
  return schoolYearEnd(now) + (12 - grade);
}

export function resolveGraduatingClass(
  athleteType: string,
  graduatingClass: unknown
): number | null {
  if (athleteType !== "athlete") return null;
  if (graduatingClass == null || graduatingClass === "") return null;
  const n = Number(graduatingClass);
  return Number.isFinite(n) ? n : null;
}

export function buildAthleteCreatePayload(input: {
  firstName: string;
  lastName: string;
  gender: AthleteCreateGender;
  alumniStaff: boolean;
  grade: number | null;
  now?: Date;
}): {
  first_name: string;
  last_name: string;
  gender: AthleteCreateGender;
  athlete_type: "athlete" | "alumni";
  graduating_class?: number;
} {
  const athlete_type = input.alumniStaff ? "alumni" : "athlete";
  const payload: {
    first_name: string;
    last_name: string;
    gender: AthleteCreateGender;
    athlete_type: "athlete" | "alumni";
    graduating_class?: number;
  } = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    gender: input.gender,
    athlete_type,
  };
  if (athlete_type === "athlete") {
    const grad =
      input.grade == null
        ? null
        : gradeToGraduatingClass(input.grade, input.now ?? new Date());
    if (grad != null) payload.graduating_class = grad;
  }
  return payload;
}

export function addOptionVisible(query: string): boolean {
  return query.trim().length > 0;
}

export function pickerOptionCount(matchCount: number, query: string): number {
  return matchCount + (addOptionVisible(query) ? 1 : 0);
}

export function isAddOptionIndex(
  highlightedIndex: number,
  matchCount: number,
  query: string
): boolean {
  return addOptionVisible(query) && highlightedIndex === matchCount;
}

export function nextHighlightIndex(
  current: number,
  optionCount: number,
  direction: 1 | -1
): number {
  if (optionCount <= 0) return 0;
  return (current + direction + optionCount) % optionCount;
}
