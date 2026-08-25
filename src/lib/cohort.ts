export const COHORT_CONFIG_ID = "fall-sc";
export const DEFAULT_CAPACITY = 12;
export const DEFAULT_TITLE = "Strength & Conditioning: Fall Term";

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

export type PublicCohortPayload = {
  title: string;
  capacity: number;
  claimed: number;
  remaining: number;
};

export function toPublicCohortPayload(derived: DerivedCohort): PublicCohortPayload {
  return {
    title: derived.title,
    capacity: derived.capacity,
    claimed: derived.claimed,
    remaining: derived.remaining,
  };
}

export function parseCapacity(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export type ParsedSignup =
  | { ok: true; display_name: string | null; grade: string | null; email: string | null }
  | { ok: false; error: string };

function optionalTrimmed(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export function parseSignupBody(body: unknown): ParsedSignup {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;
  if (b.unnamed === true) {
    return {
      ok: true,
      display_name: null,
      grade: optionalTrimmed(b.grade),
      email: optionalTrimmed(b.email),
    };
  }
  const name = optionalTrimmed(b.display_name);
  if (!name) {
    return { ok: false, error: "Name is required" };
  }
  return {
    ok: true,
    display_name: name,
    grade: optionalTrimmed(b.grade),
    email: optionalTrimmed(b.email),
  };
}
