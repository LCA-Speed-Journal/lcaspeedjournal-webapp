import { describe, expect, it } from "vitest";
import {
  f2fSchoolYearWindow,
  pickEarliestF2fMarks,
  pickF2fMarks,
} from "./pick-marks";
import type { DatedF2fEntry } from "./pick-marks";
import { buildF2fProfile } from "./profile";
import { predict40FromTwenty } from "./segment-table";

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

  it("prefers timed 5-15yd for Force when it scores better than profiled 5-10", () => {
    const fiveFifteen = dated({
      metric_key: "40yd_Dash",
      component: "5-15yd",
      display_value: 1.2,
      session_id: "may",
      session_date: MAY,
    });
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
    const picked = pickF2fMarks([fiveFifteen, fiveTen, tenTwenty, januaryBroad], {
      mode: "best",
      ...WINDOW,
    });
    expect(picked.entries.some((e) => e.component === "5-15yd")).toBe(true);
    expect(picked.entries.some((e) => e.component === "5-10yd")).toBe(false);
  });

  it("uses profiled 5-10 for Force when it scores better than a slower timed 5-15", () => {
    const slowFiveFifteen = dated({
      metric_key: "40yd_Dash",
      component: "5-15yd",
      display_value: 1.5,
      session_id: "may",
      session_date: MAY,
    });
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
    const picked = pickF2fMarks(
      [slowFiveFifteen, fiveTen, tenTwenty, januaryBroad],
      { mode: "best", ...WINDOW }
    );
    expect(picked.entries.some((e) => e.component === "5-10yd")).toBe(true);
    expect(picked.entries.some((e) => e.component === "10-20yd")).toBe(true);
    expect(picked.entries.some((e) => e.component === "5-15yd")).toBe(false);
  });

  it("prefers a faster 20-30yd Form over a slower prior 20-40yd", () => {
    // Slow 20-40 (~18.6 mph) vs fast 20-30 (1.00s = 20.45 mph) → 20-30 wins Form
    const slowTwentyForty = dated({
      metric_key: "40yd_Dash",
      component: "20-40yd",
      display_value: 2.2,
      session_id: "apr",
      session_date: APR,
    });
    const fastTwentyThirty = dated({
      metric_key: "40yd_Dash",
      component: "20-30yd",
      display_value: 1.0,
      session_id: "may",
      session_date: MAY,
    });
    const picked = pickF2fMarks(
      [slowTwentyForty, fastTwentyThirty, januaryBroad],
      { mode: "best", ...WINDOW }
    );
    expect(picked.entries.some((e) => e.component === "20-30yd")).toBe(true);
    expect(picked.entries.some((e) => e.component === "20-40yd")).toBe(false);
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

describe("pickEarliestF2fMarks", () => {
  it("takes January Broad; latest still carries Broad when April has none", () => {
    const aprilForm = dated({
      metric_key: "40yd_Dash",
      component: "20-40yd",
      display_value: 2.0,
      session_id: "apr",
      session_date: APR,
    });
    const earliest = pickEarliestF2fMarks(
      [januaryBroad, aprilForty, aprilFiveTen, aprilForm],
      WINDOW
    );
    const latest = pickF2fMarks(
      [januaryBroad, aprilForty, aprilFiveTen, aprilForm],
      { mode: "latest", ...WINDOW }
    );

    expect(earliest.mode).toBe("earliest");
    const earlyBroad = earliest.entries.find(
      (e) => e.metric_key === "Standing-Broad"
    );
    expect(earlyBroad?.session_date).toBe(JAN);

    const lateBroad = latest.entries.find(
      (e) => e.metric_key === "Standing-Broad"
    );
    expect(lateBroad?.session_date).toBe(JAN);
    expect(lateBroad?.display_value).toBe(10);
  });

  it("prefers the earliest Broad when multiple exist", () => {
    const marchBroad = dated({
      metric_key: "Standing-Broad",
      display_value: 9,
      session_id: "mar",
      session_date: MAR,
    });
    const earliest = pickEarliestF2fMarks([januaryBroad, marchBroad], WINDOW);
    expect(earliest.entries[0]?.session_date).toBe(JAN);
    expect(earliest.entries[0]?.display_value).toBe(10);
  });

  it("uses earliest-session force (5-10) not a later 5-15 for beginning", () => {
    const earlyFiveTen = dated({
      metric_key: "20yd_Dash",
      component: "5-10yd",
      display_value: 0.76,
      session_id: "jan",
      session_date: JAN,
    });
    const earlyTenTwenty = dated({
      metric_key: "20yd_Dash",
      component: "10-20yd",
      display_value: 1.37,
      session_id: "jan",
      session_date: JAN,
    });
    const laterFiveFifteen = dated({
      metric_key: "40yd_Dash",
      component: "5-15yd",
      display_value: 1.49,
      session_id: "apr",
      session_date: APR,
    });
    const earliest = pickEarliestF2fMarks(
      [januaryBroad, earlyFiveTen, earlyTenTwenty, laterFiveFifteen],
      WINDOW
    );
    const latest = pickF2fMarks(
      [januaryBroad, earlyFiveTen, earlyTenTwenty, laterFiveFifteen],
      { mode: "latest", ...WINDOW }
    );
    expect(
      earliest.entries.some((e) => e.component === "5-10yd" && e.session_date === JAN)
    ).toBe(true);
    expect(
      latest.entries.some((e) => e.component === "5-15yd" && e.session_date === APR)
    ).toBe(true);
  });

  it("keeps 0-20yd scale anchors from the Force session (20yd testing day)", () => {
    const fiveFifteen = dated({
      metric_key: "20yd_Dash",
      component: "5-15yd",
      display_value: 1.49,
      session_id: "apr",
      session_date: APR,
    });
    const zeroTwenty = dated({
      metric_key: "20yd_Dash",
      component: "0-20yd",
      display_value: 3.25,
      session_id: "apr",
      session_date: APR,
    });
    const formTenTwenty = dated({
      metric_key: "20yd_Dash",
      component: "10-20yd",
      display_value: 1.4,
      session_id: "apr",
      session_date: APR,
    });
    const latest = pickF2fMarks(
      [januaryBroad, fiveFifteen, zeroTwenty, formTenTwenty],
      { mode: "latest", ...WINDOW }
    );
    const best = pickF2fMarks(
      [januaryBroad, fiveFifteen, zeroTwenty, formTenTwenty],
      { mode: "best", ...WINDOW }
    );
    const earliest = pickEarliestF2fMarks(
      [januaryBroad, fiveFifteen, zeroTwenty, formTenTwenty],
      WINDOW
    );

    for (const picked of [latest, best, earliest]) {
      expect(
        picked.entries.some(
          (e) => e.component === "0-20yd" && e.session_id === "apr"
        )
      ).toBe(true);
      expect(picked.entries.some((e) => e.component === "5-15yd")).toBe(true);
    }
  });

  it("uses Force-session 0-20 for reference, not median(Force, Form)", () => {
    const fiveFifteen = dated({
      metric_key: "20yd_Dash",
      component: "5-15yd",
      display_value: 1.49,
      session_id: "apr",
      session_date: APR,
    });
    const zeroTwenty = dated({
      metric_key: "20yd_Dash",
      component: "0-20yd",
      display_value: 3.25,
      session_id: "apr",
      session_date: APR,
    });
    const formTenTwenty = dated({
      metric_key: "20yd_Dash",
      component: "10-20yd",
      display_value: 1.4,
      session_id: "apr",
      session_date: APR,
    });
    const picked = pickF2fMarks(
      [januaryBroad, fiveFifteen, zeroTwenty, formTenTwenty],
      { mode: "latest", ...WINDOW }
    );
    const profile = buildF2fProfile(picked.entries, { gender: "F" });
    const expectedRef = predict40FromTwenty(3.25);
    expect(expectedRef).not.toBeNull();
    expect(profile.reference_40).toBeCloseTo(expectedRef!, 4);
    expect(profile.reference_source).toBe("projected");
  });
});
