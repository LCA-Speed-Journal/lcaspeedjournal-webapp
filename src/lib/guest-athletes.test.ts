import { describe, expect, it } from "vitest";
import {
  contextHugoGroupForSave,
  guestFields,
  otherSportMatches,
  parseContextHugoGroup,
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
