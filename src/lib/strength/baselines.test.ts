import { describe, expect, it } from "vitest";
import { baselinesToWrite } from "./baselines";

describe("baselinesToWrite", () => {
  it("always writes the three anchors and only fills missing seeds", () => {
    const writes = baselinesToWrite({
      anchors: { squat: 300, bench: 200, power: 100 },
      existingPatterns: ["hinge"],
    });
    expect(writes.map((w) => w.pattern).sort()).toEqual([
      "power",
      "press",
      "pull",
      "single_leg",
      "squat",
    ]);
    expect(writes.find((w) => w.pattern === "pull")).toMatchObject({
      valueLb: 150,
      origin: "seed",
    });
    expect(writes.find((w) => w.pattern === "squat")?.origin).toBe("anchor");
  });
});
