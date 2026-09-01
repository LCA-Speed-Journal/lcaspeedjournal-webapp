import { describe, it, expect } from "vitest";
import {
  athleteHasHugoGroup,
  attachHugoGroups,
  groupMembershipsByAthleteId,
  isMissingRelationOrColumn,
  isOnHugoTeam,
  nextPrimaryAfterRemove,
  setPrimaryClearsOthers,
  shouldSetPrimaryOnFirstAdd,
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
      {
        id: "a1",
        first_name: "Jane",
        hugo_groups: ["soccer", "track"],
        hugo_primary: null,
      },
      { id: "a2", first_name: "John", hugo_groups: [], hugo_primary: null },
    ]);
  });

  it("exposes hugo_primary from the is_primary membership", () => {
    const [jane] = attachHugoGroups(
      [{ id: "a1", first_name: "Jane" }],
      [
        { athlete_id: "a1", hugo_group: "soccer", is_primary: false },
        { athlete_id: "a1", hugo_group: "football", is_primary: true },
      ]
    );
    expect(jane.hugo_groups).toEqual(["soccer", "football"]);
    expect(jane.hugo_primary).toBe("football");
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

describe("isMissingRelationOrColumn", () => {
  it("swallows rollout missing-relation and missing-column errors", () => {
    expect(
      isMissingRelationOrColumn(
        new Error('relation "athlete_hugo_memberships" does not exist')
      )
    ).toBe(true);
    expect(
      isMissingRelationOrColumn(
        new Error('column "hugo_group" of relation "athletes" does not exist')
      )
    ).toBe(true);
  });

  it("does not swallow other database errors", () => {
    expect(
      isMissingRelationOrColumn(new Error("connection refused"))
    ).toBe(false);
    expect(
      isMissingRelationOrColumn(
        new Error("duplicate key value violates unique constraint")
      )
    ).toBe(false);
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

describe("shouldSetPrimaryOnFirstAdd", () => {
  it("is true only when the athlete has no memberships yet", () => {
    expect(shouldSetPrimaryOnFirstAdd(0)).toBe(true);
    expect(shouldSetPrimaryOnFirstAdd(1)).toBe(false);
    expect(shouldSetPrimaryOnFirstAdd(2)).toBe(false);
  });
});

describe("setPrimaryClearsOthers", () => {
  it("marks only the chosen group primary", () => {
    expect(setPrimaryClearsOthers(["football", "soccer", "track"], "soccer")).toEqual([
      { hugo_group: "football", is_primary: false },
      { hugo_group: "soccer", is_primary: true },
      { hugo_group: "track", is_primary: false },
    ]);
  });

  it("clears every group when the chosen sport is not a membership", () => {
    expect(setPrimaryClearsOthers(["football", "soccer"], "track")).toEqual([
      { hugo_group: "football", is_primary: false },
      { hugo_group: "soccer", is_primary: false },
    ]);
  });
});

describe("nextPrimaryAfterRemove", () => {
  it("returns null when the last membership is removed", () => {
    expect(nextPrimaryAfterRemove([])).toBeNull();
  });

  it("keeps an existing remaining primary", () => {
    expect(
      nextPrimaryAfterRemove([
        { hugo_group: "soccer", is_primary: false },
        { hugo_group: "track", is_primary: true },
      ])
    ).toBe("track");
  });

  it("promotes the remaining group sorted by hugo_group when primary was removed", () => {
    expect(
      nextPrimaryAfterRemove([
        { hugo_group: "track", is_primary: false },
        { hugo_group: "football", is_primary: false },
        { hugo_group: "soccer", is_primary: false },
      ])
    ).toBe("football");
  });
});
