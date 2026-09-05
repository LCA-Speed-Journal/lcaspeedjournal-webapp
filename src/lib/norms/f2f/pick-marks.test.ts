import { describe, expect, it } from "vitest";
import { f2fSchoolYearWindow, pickF2fMarks } from "./pick-marks";
import type { DatedF2fEntry } from "./pick-marks";

function dated(
  partial: Omit<DatedF2fEntry, "component"> & { component?: string | null }
): DatedF2fEntry {
  return { component: null, ...partial };
}

const JAN = "2026-01-15";
const MAR = "2026-03-10";
const APR = "2026-04-20";
const MAY = "2026-05-12";
const WINDOW = { from: "2025-08-01", to: "2026-07-31" };

const januaryBroad = dated({
  metric_key: "Standing-Broad",
  display_value: 10,
  session_id: "jan",
  session_date: JAN,
});

const aprilForty = dated({
  metric_key: "40yd_Dash",
  component: "0-40yd",
  display_value: 5.2,
  session_id: "apr",
  session_date: APR,
});

const aprilFiveTen = dated({
  metric_key: "40yd_Dash",
  component: "5-10yd",
  display_value: 0.7,
  session_id: "apr",
  session_date: APR,
});

describe("f2fSchoolYearWindow", () => {
  it("runs 1 Aug of schoolYearEnd-1 through 31 Jul of schoolYearEnd", () => {
    expect(f2fSchoolYearWindow(new Date("2026-01-10T12:00:00"))).toEqual({
      from: "2025-08-01",
      to: "2026-07-31",
    });
    expect(f2fSchoolYearWindow(new Date("2026-08-25T18:00:00"))).toEqual({
      from: "2026-08-01",
      to: "2027-07-31",
    });
    expect(f2fSchoolYearWindow(new Date("2026-07-31T12:00:00"))).toEqual({
      from: "2025-08-01",
      to: "2026-07-31",
    });
  });
});

describe("pickF2fMarks best", () => {
  it("picks January explosion and April 40 independently", () => {
    const picked = pickF2fMarks([januaryBroad, aprilForty], {
      mode: "best",
      ...WINDOW,
    });

    expect(picked.mode).toBe("best");
    expect(picked.composed).toBe(true);

    const explosion = picked.entries.find(
      (entry) => entry.metric_key === "Standing-Broad"
    );
    const forty = picked.entries.find(
      (entry) => entry.component === "0-40yd"
    );
    expect(explosion?.display_value).toBe(10);
    expect(explosion?.session_date).toBe(JAN);
    expect(forty?.display_value).toBe(5.2);
    expect(forty?.session_date).toBe(APR);
  });

  it("picks Force by profile preference, not a faster 20yd stand-in", () => {
    const slowFiveTen = dated({
      metric_key: "40yd_Dash",
      component: "5-10yd",
      display_value: 1.2,
      session_id: "jan",
      session_date: JAN,
    });
    const fastTwenty = dated({
      metric_key: "20yd_Dash",
      component: "0-20yd",
      display_value: 2.4,
      session_id: "apr",
      session_date: APR,
    });

    const picked = pickF2fMarks([slowFiveTen, fastTwenty], {
      mode: "best",
      ...WINDOW,
    });

    const force = picked.entries.find(
      (entry) =>
        entry.component === "5-10yd" || entry.component === "0-20yd"
    );
    expect(force?.component).toBe("5-10yd");
    expect(force?.display_value).toBe(1.2);
    expect(force?.session_date).toBe(JAN);
  });

  it("ignores marks outside the from/to window", () => {
    const priorYear = dated({
      metric_key: "Standing-Broad",
      display_value: 11,
      session_id: "old",
      session_date: "2025-07-31",
    });

    const picked = pickF2fMarks([priorYear, januaryBroad, aprilForty], {
      mode: "best",
      ...WINDOW,
    });

    expect(
      picked.entries.some((entry) => entry.session_id === "old")
    ).toBe(false);
    expect(
      picked.entries.find((entry) => entry.metric_key === "Standing-Broad")
        ?.display_value
    ).toBe(10);
  });

  it("treats 40yd 0-20 as Force when no 5-10 exists", () => {
    const fortyTwenty = dated({
      metric_key: "40yd_Dash",
      component: "0-20yd",
      display_value: 2.9,
      session_id: "apr",
      session_date: APR,
    });

    const picked = pickF2fMarks([januaryBroad, fortyTwenty], {
      mode: "best",
      ...WINDOW,
    });

    const force = picked.entries.find((entry) => entry.component === "0-20yd");
    expect(force?.metric_key).toBe("40yd_Dash");
    expect(force?.display_value).toBe(2.9);
  });

  it("is not composed when best marks share one session_date", () => {
    const picked = pickF2fMarks([aprilForty, aprilFiveTen], {
      mode: "best",
      ...WINDOW,
    });
    expect(picked.composed).toBe(false);
  });

  it("includes 5-10 and 10-20 in best picks when there is no timed 5-15", () => {
    const fiveTen = dated({
      metric_key: "40yd_Dash",
      component: "5-10yd",
      display_value: 0.7,
      session_id: "apr",
      session_date: APR,
    });
    const tenTwenty = dated({
      metric_key: "40yd_Dash",
      component: "10-20yd",
      display_value: 1.3,
      session_id: "apr",
      session_date: APR,
    });
    const twentyForty = dated({
      metric_key: "40yd_Dash",
      component: "20-40yd",
      display_value: 2.0,
      session_id: "apr",
      session_date: APR,
    });
    const picked = pickF2fMarks([fiveTen, tenTwenty, twentyForty], {
      mode: "best",
      ...WINDOW,
    });
    expect(picked.entries.some((e) => e.component === "5-10yd")).toBe(true);
    expect(picked.entries.some((e) => e.component === "10-20yd")).toBe(true);
    expect(picked.entries.some((e) => e.component === "20-40yd")).toBe(true);
  });
});

describe("pickF2fMarks full-test", () => {
  it("uses only the last testing session (January jump does not appear)", () => {
    const picked = pickF2fMarks(
      [januaryBroad, aprilForty, aprilFiveTen],
      { mode: "full-test", ...WINDOW }
    );

    expect(picked.mode).toBe("full-test");
    expect(picked.composed).toBe(false);
    expect(picked.as_of).toBe(APR);
    expect(picked.entries.every((entry) => entry.session_id === "apr")).toBe(
      true
    );
    expect(
      picked.entries.some((entry) => entry.metric_key === "Standing-Broad")
    ).toBe(false);
    expect(picked.entries).toHaveLength(2);
    expect(picked.entries.map((entry) => entry.session_date)).toEqual([
      APR,
      APR,
    ]);
  });

  it("prefers the latest session with 2+ F2F buckets over a later jump-only day", () => {
    const mayBroad = dated({
      metric_key: "Standing-Broad",
      display_value: 9.5,
      session_id: "may",
      session_date: MAY,
    });

    const picked = pickF2fMarks(
      [januaryBroad, aprilForty, aprilFiveTen, mayBroad],
      { mode: "full-test", ...WINDOW }
    );

    expect(picked.as_of).toBe(APR);
    expect(picked.entries.every((entry) => entry.session_id === "apr")).toBe(
      true
    );
    expect(
      picked.entries.some((entry) => entry.metric_key === "Standing-Broad")
    ).toBe(false);
    expect(picked.entries.map((entry) => entry.component).sort()).toEqual([
      "0-40yd",
      "5-10yd",
    ]);
  });
});

describe("pickF2fMarks latest", () => {
  it("takes the most recent mark per quality", () => {
    const marchBroad = dated({
      metric_key: "Standing-Broad",
      display_value: 9,
      session_id: "mar",
      session_date: MAR,
    });

    const picked = pickF2fMarks([januaryBroad, marchBroad, aprilForty], {
      mode: "latest",
      ...WINDOW,
    });

    expect(picked.mode).toBe("latest");
    expect(picked.composed).toBe(true);

    const explosion = picked.entries.find(
      (entry) => entry.metric_key === "Standing-Broad"
    );
    const forty = picked.entries.find(
      (entry) => entry.component === "0-40yd"
    );
    expect(explosion?.display_value).toBe(9);
    expect(explosion?.session_date).toBe(MAR);
    expect(forty?.display_value).toBe(5.2);
    expect(forty?.session_date).toBe(APR);
  });

  it("breaks same-day ties with created_at", () => {
    const morning = dated({
      metric_key: "Standing-Broad",
      display_value: 10,
      session_id: "a",
      session_date: JAN,
      created_at: "2026-01-15T10:00:00.000Z",
    });
    const afternoon = dated({
      metric_key: "Standing-Broad",
      display_value: 9,
      session_id: "b",
      session_date: JAN,
      created_at: "2026-01-15T16:00:00.000Z",
    });

    const picked = pickF2fMarks([morning, afternoon], {
      mode: "latest",
      ...WINDOW,
    });

    expect(picked.entries).toHaveLength(1);
    expect(picked.entries[0].display_value).toBe(9);
    expect(picked.entries[0].session_id).toBe("b");
  });

  it("is not composed when latest marks share one session_date", () => {
    const picked = pickF2fMarks([aprilForty, aprilFiveTen], {
      mode: "latest",
      ...WINDOW,
    });
    expect(picked.composed).toBe(false);
  });

  it("includes later 5-10 and later 10-20 even when 20-40 is the Form mark", () => {
    const earlyFiveTen = dated({
      metric_key: "40yd_Dash",
      component: "5-10yd",
      display_value: 0.65,
      session_id: "jan",
      session_date: JAN,
    });
    const laterFiveTen = dated({
      metric_key: "40yd_Dash",
      component: "5-10yd",
      display_value: 0.7,
      session_id: "apr",
      session_date: APR,
    });
    const earlyTenTwenty = dated({
      metric_key: "40yd_Dash",
      component: "10-20yd",
      display_value: 1.2,
      session_id: "jan",
      session_date: JAN,
    });
    const laterTenTwenty = dated({
      metric_key: "40yd_Dash",
      component: "10-20yd",
      display_value: 1.3,
      session_id: "apr",
      session_date: APR,
    });
    const twentyForty = dated({
      metric_key: "40yd_Dash",
      component: "20-40yd",
      display_value: 2.0,
      session_id: "may",
      session_date: MAY,
    });
    const picked = pickF2fMarks(
      [earlyFiveTen, laterFiveTen, earlyTenTwenty, laterTenTwenty, twentyForty],
      { mode: "latest", ...WINDOW }
    );
    const fiveTen = picked.entries.find((e) => e.component === "5-10yd");
    const tenTwenty = picked.entries.find((e) => e.component === "10-20yd");
    const form = picked.entries.find((e) => e.component === "20-40yd");
    expect(fiveTen?.session_date).toBe(APR);
    expect(tenTwenty?.session_date).toBe(APR);
    expect(form?.session_date).toBe(MAY);
  });
});
