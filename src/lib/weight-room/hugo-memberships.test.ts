import { describe, it, expect } from "vitest";
import {
  athleteHasHugoGroup,
  attachHugoGroups,
  groupMembershipsByAthleteId,
  isOnHugoTeam,
} from "./hugo-memberships";

describe("groupMembershipsByAthleteId", () => {
  it("groups memberships under each athlete_id", () => {
    const map = groupMembershipsByAthleteId([
      { athlete_id: "a1", hugo_group: "soccer" },
      { athlete_id: "a1", hugo_group: "track" },
      { athlete_id: "a2", hugo_group: "xc" },
    ]);
    expect(map.get("a1")).toEqual(["soccer", "track"]);
    expect(map.get("a2")).toEqual(["xc"]);
    expect(map.get("missing")).toBeUndefined();
  });
});

describe("attachHugoGroups", () => {
  it("adds hugo_groups arrays, empty when none", () => {
    const athletes = [
      { id: "a1", first_name: "Jane" },
      { id: "a2", first_name: "John" },
    ];
    expect(
      attachHugoGroups(athletes, [
        { athlete_id: "a1", hugo_group: "soccer" },
        { athlete_id: "a1", hugo_group: "track" },
      ])
    ).toEqual([
      { id: "a1", first_name: "Jane", hugo_groups: ["soccer", "track"] },
      { id: "a2", first_name: "John", hugo_groups: [] },
    ]);
  });
});

describe("isOnHugoTeam", () => {
  it("is true when hugo_groups has any membership", () => {
    expect(isOnHugoTeam({ hugo_groups: ["soccer"], hugo_group: null })).toBe(
      true
    );
  });

  it("falls back to scalar hugo_group during rollout", () => {
    expect(isOnHugoTeam({ hugo_groups: [], hugo_group: "track" })).toBe(true);
    expect(isOnHugoTeam({ hugo_group: "soccer" })).toBe(true);
  });

  it("is false when neither memberships nor scalar are set", () => {
    expect(isOnHugoTeam({ hugo_groups: [], hugo_group: null })).toBe(false);
    expect(isOnHugoTeam({})).toBe(false);
  });
});

describe("athleteHasHugoGroup", () => {
  it("matches hugo_groups and falls back to scalar", () => {
    expect(
      athleteHasHugoGroup(
        { hugo_groups: ["track", "soccer"], hugo_group: "xc" },
        "soccer"
      )
    ).toBe(true);
    expect(athleteHasHugoGroup({ hugo_group: "soccer" }, "soccer")).toBe(true);
    expect(
      athleteHasHugoGroup({ hugo_groups: ["track"], hugo_group: "xc" }, "soccer")
    ).toBe(false);
  });
});
