import { describe, expect, it } from "vitest";
import { parseContextHugoGroup } from "./guest-athletes";

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
