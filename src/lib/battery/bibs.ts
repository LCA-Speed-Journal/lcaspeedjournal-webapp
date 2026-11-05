export type BibAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  graduating_class: number | null;
};

export type IssuedBib = { athlete_id: string; bib: string };

export type AssignedBib = {
  athlete_id: string;
  bib: string;
  grade_digit: number;
  alpha_index: number;
};

export function gradeDigit(
  graduatingClass: number | null,
  seniorGradYear: number
): number | null {
  if (graduatingClass == null) return null;
  const digit = 12 - (graduatingClass - seniorGradYear) - 8;
  if (digit !== 1 && digit !== 2 && digit !== 3 && digit !== 4) return null;
  return digit;
}

function graduatingClassForDigit(digit: number, seniorGradYear: number): number {
  return seniorGradYear + (4 - digit);
}

function bibGradeDigit(bib: string): number | null {
  const digit = Number(bib[0]);
  if (digit !== 1 && digit !== 2 && digit !== 3 && digit !== 4) return null;
  return digit;
}

/**
 * Athletes assignBibs should see after bibs are issued.
 * Stored numbers stay reserved when that athlete has left the roster,
 * or when their current grade digit no longer matches the stored bib.
 */
export function athletesForIssuedBibs(
  roster: BibAthlete[],
  stored: IssuedBib[],
  seniorGradYear: number
): BibAthlete[] {
  const rosterById = new Map(roster.map((athlete) => [athlete.athlete_id, athlete]));
  const placeholders: BibAthlete[] = [];
  for (const row of stored) {
    const digit = bibGradeDigit(row.bib);
    if (digit == null) continue;
    const athlete = rosterById.get(row.athlete_id);
    if (athlete && gradeDigit(athlete.graduating_class, seniorGradYear) === digit) continue;
    placeholders.push({
      athlete_id: row.athlete_id,
      first_name: "",
      last_name: "",
      graduating_class: graduatingClassForDigit(digit, seniorGradYear),
    });
  }
  return [...roster, ...placeholders];
}

function byName(a: BibAthlete, b: BibAthlete): number {
  return (
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name) ||
    a.athlete_id.localeCompare(b.athlete_id)
  );
}

export function assignBibs(
  athletes: BibAthlete[],
  seniorGradYear: number,
  issued: IssuedBib[]
): AssignedBib[] {
  const issuedById = new Map(issued.map((row) => [row.athlete_id, row.bib]));
  const out: AssignedBib[] = [];
  for (const digit of [1, 2, 3, 4]) {
    const group = athletes
      .filter((athlete) => gradeDigit(athlete.graduating_class, seniorGradYear) === digit)
      .toSorted(byName);
    const taken = new Set<number>();
    for (const athlete of group) {
      const existing = issuedById.get(athlete.athlete_id);
      if (!existing || !existing.startsWith(String(digit))) continue;
      taken.add(Number(existing.slice(1)));
    }
    let next = 1;
    for (const athlete of group) {
      const existing = issuedById.get(athlete.athlete_id);
      if (existing && existing.startsWith(String(digit))) {
        out.push({
          athlete_id: athlete.athlete_id,
          bib: existing,
          grade_digit: digit,
          alpha_index: Number(existing.slice(1)),
        });
        continue;
      }
      while (taken.has(next)) next += 1;
      const alpha = next;
      taken.add(alpha);
      next += 1;
      out.push({
        athlete_id: athlete.athlete_id,
        bib: `${digit}${String(alpha).padStart(2, "0")}`,
        grade_digit: digit,
        alpha_index: alpha,
      });
    }
  }
  return out;
}
