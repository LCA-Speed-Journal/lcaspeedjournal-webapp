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
  it("splits overall leaders by gender and ignores split components", () => {
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
