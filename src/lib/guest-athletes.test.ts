import { describe, expect, it } from "vitest";
import { guestFields, parseContextHugoGroup } from "./guest-athletes";

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
