import { describe, expect, it } from "vitest";
import { buildTeamLeaders, type LeaderEntryRow, type LeaderAthlete } from "./team-leaders";

const athletes: LeaderAthlete[] = [
  { id: "m1", first_name: "Max", last_name: "Male", gender: "M", hugo_groups: ["football"] },
  { id: "f1", first_name: "Faye", last_name: "Female", gender: "F", hugo_groups: ["volleyball"] },
  { id: "m2", first_name: "Alum", last_name: "Gone", gender: "M", hugo_groups: ["football"] },
];

const entries: LeaderEntryRow[] = [
  { athlete_id: "m1", metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.1, units: "s" },
  { athlete_id: "m1", metric_key: "40yd_Dash", component: "0-10yd", display_value: 1.5, units: "s" },
  { athlete_id: "f1", metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.8, units: "s" },
  { athlete_id: "m2", metric_key: "40yd_Dash", component: "0-40yd", display_value: 4.4, units: "s" },
];

describe("buildTeamLeaders", () => {
  it("splits overall leaders by gender and keeps full-run 40yd on the parent row", () => {
    const { overall } = buildTeamLeaders({
      athletes: athletes.filter((a) => a.id !== "m2"),
      entries,
    });
    const forty = overall.find((r) => r.metric_key === "40yd_Dash")!;
    expect(forty.lower_is_better).toBe(true);
    expect(forty.men?.athlete_id).toBe("m1");
    expect(forty.men?.best_value).toBe(5.1);
    expect(forty.women?.athlete_id).toBe("f1");
    expect(forty.women?.best_value).toBe(5.8);
    const ten = forty.splits?.find((s) => s.component === "0-10yd");
    expect(ten?.men?.best_value).toBe(1.5);
    expect(ten?.women).toBeNull();
  });

  it("adds Max Velocity from mph metrics and 20-40yd fly splits", () => {
    const { overall } = buildTeamLeaders({
      athletes: athletes.filter((a) => a.id !== "m2"),
      entries: [
        ...entries,
        {
          athlete_id: "m1",
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.0,
          units: "s",
        },
        {
          athlete_id: "f1",
          metric_key: "10-20m_Split",
          component: null,
          display_value: 18.5,
          units: "mph",
        },
      ],
    });
    const maxV = overall.find((r) => r.metric_key === "MaxVelocity")!;
    expect(maxV.display_name).toBe("Max Velocity");
    expect(maxV.units).toBe("mph");
    expect(maxV.lower_is_better).toBe(false);
    // 20 yards in 2.00s → 20.45 mph
    expect(maxV.men?.best_value).toBeCloseTo(20.45);
    expect(maxV.women?.best_value).toBe(18.5);
    expect(overall.some((r) => r.metric_key === "10-20m_Split")).toBe(false);
    const fly = overall
      .find((r) => r.metric_key === "40yd_Dash")
      ?.splits?.find((s) => s.component === "20-40yd");
    expect(fly?.men?.best_value).toBe(2.0);
    expect(fly?.units).toBe("s");
  });

  it("scopes Hugo sections to membership and can list the same athlete on two teams", () => {
    const dual: LeaderAthlete[] = [
      { id: "m1", first_name: "Max", last_name: "Male", gender: "M", hugo_groups: ["football", "soccer"] },
    ];
    const { hugo } = buildTeamLeaders({
      athletes: dual,
      entries: [
        { athlete_id: "m1", metric_key: "Standing-Broad", component: null, display_value: 9.5, units: "ft" },
      ],
    });
    const groups = hugo.map((h) => h.hugo_group).sort();
    expect(groups).toEqual(["football", "soccer"]);
    expect(hugo[0]!.leaders[0]!.men?.athlete_id).toBe("m1");
  });
});
