import { describe, expect, it } from "vitest";
import { parseEntry } from "@/lib/parser";

describe("battery station parsing", () => {
  it("stores four DRI marks on their box components", () => {
    const rows = parseEntry("DRI", "0.8, 1.9, 2.4, 1.6");
    expect(rows.map((row) => [row.component, row.display_value])).toEqual([
      ["6", 0.8],
      ["12", 1.9],
      ["18", 2.4],
      ["24", 1.6],
    ]);
  });

  it("stores ten 10x10 reps as interval rows", () => {
    const raw = "1.80, 1.82, 1.85, 1.84, 1.90, 1.88, 1.91, 1.93, 1.95, 1.97";
    const rows = parseEntry("10x10m", raw);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ interval_index: 1, units: "s", display_value: 1.8 });
    expect(rows[9].interval_index).toBe(10);
    expect(rows.every((row) => row.component == null)).toBe(true);
  });

  it("rejects a short 10x10", () => {
    expect(() => parseEntry("10x10m", "1.8, 1.9")).toThrow();
  });

  it("rejects a short DRI line", () => {
    expect(() => parseEntry("DRI", "1.2, 1.4")).toThrow();
  });
});
