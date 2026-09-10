import { describe, it, expect } from "vitest";
import { moveMovement } from "./reorder-movements";

const rows = [
  { key: "a", name: "Primer" },
  { key: "b", name: "Main" },
  { key: "c", name: "Finisher" },
];

describe("moveMovement", () => {
  it("moves a late add up one row", () => {
    const next = moveMovement(rows, "c", -1);
    expect(next.map((r) => r.key)).toEqual(["a", "c", "b"]);
  });

  it("moves a row down one", () => {
    const next = moveMovement(rows, "a", 1);
    expect(next.map((r) => r.key)).toEqual(["b", "a", "c"]);
  });

  it("leaves the first row in place when moving up", () => {
    expect(moveMovement(rows, "a", -1)).toEqual(rows);
  });

  it("leaves the last row in place when moving down", () => {
    expect(moveMovement(rows, "c", 1)).toEqual(rows);
  });
});
