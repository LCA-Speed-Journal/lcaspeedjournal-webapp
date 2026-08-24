import { describe, it, expect } from "vitest";
import { deriveCohort, DEFAULT_CAPACITY, DEFAULT_TITLE } from "./cohort";
import type { CohortSignup } from "./cohort";

function signup(
  overrides: Partial<CohortSignup> & Pick<CohortSignup, "id" | "created_at">
): CohortSignup {
  return {
    display_name: null,
    grade: null,
    email: null,
    ...overrides,
  };
}

describe("deriveCohort", () => {
  it("returns empty claimed and full remaining when there are no signups", () => {
    const result = deriveCohort([], 12, DEFAULT_TITLE);
    expect(result.capacity).toBe(12);
    expect(result.claimed).toBe(0);
    expect(result.remaining).toBe(12);
    expect(result.inCohort).toEqual([]);
    expect(result.waitlist).toEqual([]);
    expect(result.title).toBe(DEFAULT_TITLE);
  });

  it("places everyone in cohort when count is under capacity", () => {
    const rows = [
      signup({ id: "a", display_name: "Ana", created_at: "2026-08-24T18:00:00.000Z" }),
      signup({ id: "b", display_name: "Ben", created_at: "2026-08-24T18:01:00.000Z" }),
    ];
    const result = deriveCohort(rows, 12);
    expect(result.claimed).toBe(2);
    expect(result.remaining).toBe(10);
    expect(result.inCohort.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.waitlist).toEqual([]);
    expect(result.inCohort.every((s) => s.in_cohort && s.waitlist_position === null)).toBe(true);
  });

  it("puts overflow on the waitlist in signup order", () => {
    const rows = [1, 2, 3].map((n) =>
      signup({
        id: String(n),
        display_name: `P${n}`,
        created_at: `2026-08-24T18:0${n}:00.000Z`,
      })
    );
    const result = deriveCohort(rows, 2);
    expect(result.claimed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(result.inCohort.map((s) => s.id)).toEqual(["1", "2"]);
    expect(result.waitlist.map((s) => s.id)).toEqual(["3"]);
    expect(result.waitlist[0].waitlist_position).toBe(1);
    expect(result.waitlist[0].in_cohort).toBe(false);
  });

  it("treats unnamed placeholders like named rows for order", () => {
    const rows = [
      signup({ id: "u", display_name: null, created_at: "2026-08-24T18:00:00.000Z" }),
      signup({ id: "n", display_name: "Named", created_at: "2026-08-24T18:01:00.000Z" }),
    ];
    const result = deriveCohort(rows, 1);
    expect(result.inCohort[0].id).toBe("u");
    expect(result.waitlist[0].id).toBe("n");
  });

  it("promotes waitlist into cohort when capacity increases", () => {
    const rows = [1, 2, 3].map((n) =>
      signup({
        id: String(n),
        display_name: `P${n}`,
        created_at: `2026-08-24T18:0${n}:00.000Z`,
      })
    );
    const at12 = deriveCohort(rows, 2);
    expect(at12.waitlist.map((s) => s.id)).toEqual(["3"]);
    const bumped = deriveCohort(rows, 3);
    expect(bumped.claimed).toBe(3);
    expect(bumped.remaining).toBe(0);
    expect(bumped.waitlist).toEqual([]);
    expect(bumped.inCohort.map((s) => s.id)).toEqual(["1", "2", "3"]);
  });

  it("demotes last claimed onto waitlist when capacity decreases (does not drop rows)", () => {
    const rows = [1, 2, 3].map((n) =>
      signup({
        id: String(n),
        display_name: `P${n}`,
        created_at: `2026-08-24T18:0${n}:00.000Z`,
      })
    );
    const result = deriveCohort(rows, 1);
    expect(result.claimed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(result.inCohort.map((s) => s.id)).toEqual(["1"]);
    expect(result.waitlist.map((s) => s.id)).toEqual(["2", "3"]);
    expect(result.waitlist.map((s) => s.waitlist_position)).toEqual([1, 2]);
  });

  it("sorts by created_at even if input is unordered", () => {
    const rows = [
      signup({ id: "b", display_name: "B", created_at: "2026-08-24T18:02:00.000Z" }),
      signup({ id: "a", display_name: "A", created_at: "2026-08-24T18:00:00.000Z" }),
    ];
    const result = deriveCohort(rows, DEFAULT_CAPACITY);
    expect(result.inCohort.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("clamps capacity below 1 up to 1", () => {
    const result = deriveCohort([], 0);
    expect(result.capacity).toBe(1);
    expect(result.remaining).toBe(1);
  });
});
