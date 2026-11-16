import { describe, expect, it } from "vitest";
import { isGroupingMode, preferredGroupKey } from "./testing-groups";

describe("testing groups", () => {
  it("accepts the two board modes", () => {
    expect(isGroupingMode("cutoff")).toBe(true);
    expect(isGroupingMode("subteam")).toBe(true);
    expect(isGroupingMode("varsity")).toBe(false);
  });

  it("keeps the earliest team when an athlete was saved on more than one", () => {
    expect(
      preferredGroupKey([
        { group_key: "c_team", sort_order: 3 },
        { group_key: "jv", sort_order: 2 },
      ])
    ).toBe("jv");
    expect(preferredGroupKey([])).toBeNull();
  });
});
