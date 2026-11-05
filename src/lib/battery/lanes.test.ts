import { describe, expect, it } from "vitest";
import { seedLanes } from "./lanes";

describe("seedLanes", () => {
  it("pairs 1 with 2 and runs that heat last", () => {
    const heats = seedLanes(["a", "b", "c", "d"]);
    expect(heats.map((heat) => heat.athlete_ids)).toEqual([
      ["c", "d"],
      ["a", "b"],
    ]);
    expect(heats[1].is_final).toBe(true);
  });

  it("opens with a solo when the field is odd", () => {
    const heats = seedLanes(["a", "b", "c"]);
    expect(heats[0].athlete_ids).toEqual(["c"]);
    expect(heats[heats.length - 1].athlete_ids).toEqual(["a", "b"]);
  });
});
