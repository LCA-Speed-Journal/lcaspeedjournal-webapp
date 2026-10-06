import { describe, expect, it } from "vitest";
import {
  contextHugoGroupForSave,
  filterReportSourceToMembers,
  guestFields,
  idsOnRoster,
  loggedGuests,
  otherSportMatches,
  parseContextHugoGroup,
  searchGuests,
  shouldClearAthleteOnSportChange,
} from "./guest-athletes";

const soccer = { id: "s", first_name: "Sue", last_name: "Soccer", hugo_groups: ["soccer"] };
const ball = { id: "b", first_name: "Sam", last_name: "Ball", hugo_groups: ["mens_basketball"] };

describe("parseContextHugoGroup", () => {
  it("allows null and blank", () => {
    expect(parseContextHugoGroup(undefined)).toEqual({ ok: true, value: null });
    expect(parseContextHugoGroup(null)).toEqual({ ok: true, value: null });
    expect(parseContextHugoGroup("")).toEqual({ ok: true, value: null });
  });

  it("accepts a Hugo sport", () => {
    expect(parseContextHugoGroup("soccer")).toEqual({ ok: true, value: "soccer" });
  });

  it("rejects an unknown sport", () => {
    expect(parseContextHugoGroup("curling")).toEqual({
      ok: false,
      error: "Invalid context_hugo_group",
    });
  });
});

describe("guestFields", () => {
  it("is a guest when the saved sport is not one of their memberships", () => {
    expect(guestFields("soccer", ["mens_basketball"])).toEqual({
      guest: true,
      home_sport_label: "Men's Basketball",
    });
  });

  it("joins every home sport", () => {
    expect(guestFields("volleyball", ["xc", "track"]).home_sport_label).toBe(
      "XC, Track"
    );
  });

  it("is not a guest for a member, a null context, or an unknown context", () => {
    expect(guestFields("soccer", ["soccer"]).guest).toBe(false);
    expect(guestFields(null, ["mens_basketball"]).guest).toBe(false);
    expect(guestFields("curling", ["mens_basketball"]).guest).toBe(false);
  });

  it("still marks Guest when they have no memberships", () => {
    expect(guestFields("soccer", [])).toEqual({
      guest: true,
      home_sport_label: null,
    });
  });
});

describe("otherSportMatches", () => {
  it("returns nothing until a sport is selected and the coach has typed", () => {
    expect(otherSportMatches([soccer, ball], "", "sam")).toEqual([]);
    expect(otherSportMatches([soccer, ball], "soccer", "")).toEqual([]);
    expect(otherSportMatches([soccer, ball], "soccer", "   ")).toEqual([]);
  });

  it("returns name matches outside the selected sport", () => {
    expect(otherSportMatches([soccer, ball], "soccer", "sam")).toEqual([ball]);
    expect(otherSportMatches([soccer, ball], "soccer", "sue")).toEqual([]);
  });
});

const roster = [{ id: "s", first_name: "Sue", last_name: "Soccer" }];
const sam = { id: "b", first_name: "Sam", last_name: "Ball", hugo_groups: ["mens_basketball"] };
const sue = { id: "s", first_name: "Sue", last_name: "Soccer", hugo_groups: ["soccer"] };

describe("weight-room guests", () => {
  it("returns logged athletes who are not on the roster", () => {
    expect(loggedGuests(roster, ["s", "b", "b"], [sue, sam])).toEqual([sam]);
  });

  it("searches active athletes outside the card sport, skipping people already listed", () => {
    expect(searchGuests([sue, sam], "soccer", new Set(["s"]), "")).toEqual([]);
    expect(searchGuests([sue, sam], "soccer", new Set(["s"]), "sam")).toEqual([sam]);
    expect(searchGuests([sue, sam], "soccer", new Set(["b"]), "sam")).toEqual([]);
  });
});

describe("context and sport changes", () => {
  it("saves the selected sport and saves null for All sports", () => {
    expect(contextHugoGroupForSave("soccer")).toBe("soccer");
    expect(contextHugoGroupForSave("")).toBeNull();
  });

  it("clears a pick that is outside the new sport and keeps All sports", () => {
    expect(shouldClearAthleteOnSportChange(ball, "volleyball")).toBe(true);
    expect(shouldClearAthleteOnSportChange(ball, "mens_basketball")).toBe(false);
    expect(shouldClearAthleteOnSportChange(ball, "")).toBe(false);
  });
});

describe("season member filter", () => {
  it("drops logs, their results, and athlete rows outside the roster", () => {
    const source = {
      logs: [
        { id: "log-member", athlete_id: "sue", template_id: "t", session_date: "2026-10-06", hugo_group: "soccer" },
        { id: "log-guest", athlete_id: "sam", template_id: "t", session_date: "2026-10-06", hugo_group: "soccer" },
      ],
      results: [
        { session_log_id: "log-member", movement_id: "m", raw_text: "50x5", kind: "load", load: 50, reps: 5, units: "lb" },
        { session_log_id: "log-guest", movement_id: "m", raw_text: "40x5", kind: "load", load: 40, reps: 5, units: "lb" },
      ],
      movements: [],
      athletes: [
        { id: "sue", first_name: "Sue", last_name: "Soccer" },
        { id: "sam", first_name: "Sam", last_name: "Ball" },
      ],
    };
    const filtered = filterReportSourceToMembers(source, new Set(["sue"]));
    expect(filtered.logs.map((log) => log.id)).toEqual(["log-member"]);
    expect(filtered.results.map((row) => row.session_log_id)).toEqual(["log-member"]);
    expect(filtered.athletes.map((athlete) => athlete.id)).toEqual(["sue"]);
  });

  it("builds a roster id set", () => {
    expect(idsOnRoster([{ id: "sue" }, { id: "sam" }])).toEqual(new Set(["sue", "sam"]));
  });
});
