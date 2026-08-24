export const COHORT_CONFIG_ID = "fall-sc";
export const DEFAULT_CAPACITY = 12;
export const DEFAULT_TITLE = "Fall Strength & Conditioning";

export type CohortSignup = {
  id: string;
  display_name: string | null;
  grade: string | null;
  email: string | null;
  created_at: string;
};

export type DerivedSignup = CohortSignup & {
  in_cohort: boolean;
  waitlist_position: number | null;
};

export type DerivedCohort = {
  title: string;
  capacity: number;
  claimed: number;
  remaining: number;
  inCohort: DerivedSignup[];
  waitlist: DerivedSignup[];
  signups: DerivedSignup[];
};

export function deriveCohort(
  signups: CohortSignup[],
  capacity: number,
  title: string = DEFAULT_TITLE
): DerivedCohort {
  const cap = Number.isFinite(capacity) ? Math.max(1, Math.floor(capacity)) : DEFAULT_CAPACITY;
  const ordered = [...signups].toSorted(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const withFlags: DerivedSignup[] = ordered.map((s, i) => ({
    ...s,
    in_cohort: i < cap,
    waitlist_position: i < cap ? null : i - cap + 1,
  }));
  const inCohort = withFlags.filter((s) => s.in_cohort);
  const waitlist = withFlags.filter((s) => !s.in_cohort);
  return {
    title,
    capacity: cap,
    claimed: inCohort.length,
    remaining: cap - inCohort.length,
    inCohort,
    waitlist,
    signups: withFlags,
  };
}
