import { describe, expect, it } from "vitest";
import { aggregateAthleteF2f } from "./f2f-aggregate";
import type { DatedF2fEntry } from "@/lib/norms/f2f/pick-marks";

function entry(
  partial: Partial<DatedF2fEntry> & {
    metric_key: string;
    display_value: number;
    session_id: string;
    session_date: string;
  }
): DatedF2fEntry {
  return {
    component: partial.component ?? null,
    ...partial,
  };
}

describe("aggregateAthleteF2f", () => {
  it("includes athletes with a retested quality and carries Broad forward", () => {
    const athletes = [
      { id: "a1", first_name: "Ann", last_name: "One", gender: "F" },
      { id: "a2", first_name: "Bob", last_name: "Two", gender: "M" },
    ];

    // a1 — day1 full triangle; day2 only force/form (Broad must carry forward)
    const a1: Array<DatedF2fEntry & { athlete_id: string }> = [
      {
        ...entry({
          metric_key: "Standing-Broad",
          display_value: 8.0,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.5,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.2,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.45,
          session_id: "s2",
          session_date: "2026-10-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.1,
          session_id: "s2",
          session_date: "2026-10-10",
        }),
        athlete_id: "a1",
      },
    ];

    // a2 — single session only → no retest → omitted
    const a2: Array<DatedF2fEntry & { athlete_id: string }> = [
      {
        ...entry({
          metric_key: "Standing-Broad",
          display_value: 9.0,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a2",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.4,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a2",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.0,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a2",
      },
    ];

    const result = aggregateAthleteF2f({
      athletes,
      entries: [...a1, ...a2],
      endMode: "latest",
    });

    expect(result.athletes).toHaveLength(1);
    expect(result.athletes[0]!.id).toBe("a1");
    expect(result.athletes[0]!.first_profile.explosion).not.toBeNull();
    expect(result.athletes[0]!.last_profile.explosion).not.toBeNull();
    expect(result.athletes[0]!.last_profile.explosion?.session_date).toBe(
      "2026-08-10"
    );
    expect(result.athletes[0]!.last_profile.force).not.toBeNull();
    expect(result.end_mode).toBe("latest");
  });

  it("includes Force-only retest with other axes carried forward", () => {
    const athletes = [
      { id: "a1", first_name: "Ann", last_name: "One", gender: "F" },
    ];
    const entries: Array<DatedF2fEntry & { athlete_id: string }> = [
      {
        ...entry({
          metric_key: "Standing-Broad",
          display_value: 8.0,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.5,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.2,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.35,
          session_id: "s2",
          session_date: "2026-09-20",
        }),
        athlete_id: "a1",
      },
    ];

    const result = aggregateAthleteF2f({ athletes, entries, endMode: "latest" });
    expect(result.athletes).toHaveLength(1);
    const row = result.athletes[0]!;
    expect(row.last_profile.force).not.toBeNull();
    expect(row.last_profile.explosion).not.toBeNull();
    expect(row.last_profile.form).not.toBeNull();
    expect(row.first_profile.force?.predicted_40).not.toBe(
      row.last_profile.force?.predicted_40
    );
  });

  it("supports best end mode", () => {
    const athletes = [
      { id: "a1", first_name: "Ann", last_name: "One", gender: "F" },
    ];
    const entries: Array<DatedF2fEntry & { athlete_id: string }> = [
      {
        ...entry({
          metric_key: "Standing-Broad",
          display_value: 8.0,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "Standing-Broad",
          display_value: 7.5,
          session_id: "s2",
          session_date: "2026-10-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.5,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "5-15yd",
          display_value: 1.35,
          session_id: "s2",
          session_date: "2026-10-10",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.2,
          session_id: "s1",
          session_date: "2026-08-10",
        }),
        athlete_id: "a1",
      },
    ];

    const result = aggregateAthleteF2f({ athletes, entries, endMode: "best" });
    expect(result.athletes).toHaveLength(1);
    expect(result.end_mode).toBe("best");
    // Best Broad is 8.0 from s1, not the later worse 7.5
    expect(result.athletes[0]!.last_profile.explosion?.input?.value).toBe(8.0);
  });

  it("keeps Best eligible when early Force still beats a later retest", () => {
    // Volleyball-style: day1 20yd battery (good Force); day2 slower 5-15 retest.
    // Most-recent end differs; Best Force may match Beginning — still show the athlete.
    const athletes = [
      { id: "a1", first_name: "Ann", last_name: "One", gender: "F" },
    ];
    const entries: Array<DatedF2fEntry & { athlete_id: string }> = [
      {
        ...entry({
          metric_key: "Standing-Broad",
          display_value: 8.0,
          session_id: "s1",
          session_date: "2026-09-04",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "20yd_Dash",
          component: "5-10yd",
          display_value: 0.7,
          session_id: "s1",
          session_date: "2026-09-04",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "20yd_Dash",
          component: "10-20yd",
          display_value: 1.3,
          session_id: "s1",
          session_date: "2026-09-04",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "20yd_Dash",
          component: "0-20yd",
          display_value: 3.25,
          session_id: "s1",
          session_date: "2026-09-04",
        }),
        athlete_id: "a1",
      },
      {
        ...entry({
          metric_key: "20yd_Dash",
          component: "5-15yd",
          display_value: 1.55,
          session_id: "s2",
          session_date: "2026-09-15",
        }),
        athlete_id: "a1",
      },
    ];

    const latest = aggregateAthleteF2f({
      athletes,
      entries,
      endMode: "latest",
    });
    const best = aggregateAthleteF2f({ athletes, entries, endMode: "best" });
    expect(latest.athletes).toHaveLength(1);
    expect(best.athletes).toHaveLength(1);
    // Best Force should prefer the earlier profiled 5-10 over the slower 5-15
    expect(best.athletes[0]!.last_profile.force?.projected).toBe(true);
  });
});
