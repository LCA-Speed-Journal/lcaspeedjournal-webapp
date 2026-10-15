import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { carryForwardMedian } from "./load-sets";

describe("carryForwardMedian", () => {
  it("uses a carried value when one athlete misses the second date", () => {
    const series = carryForwardMedian([
      {
        pattern: "squat",
        points: [
          { athleteId: "a", date: "2026-10-01", referenceE1rm: 100 },
          { athleteId: "b", date: "2026-10-01", referenceE1rm: 300 },
          { athleteId: "a", date: "2026-10-08", referenceE1rm: 200 },
        ],
      },
      {
        pattern: "hinge",
        points: [
          { athleteId: "a", date: "2026-10-08", referenceE1rm: 400 },
        ],
      },
    ]);

    expect(series.find((pattern) => pattern.pattern === "squat")?.points).toEqual([
      { date: "2026-10-01", referenceE1rm: 200 },
      { date: "2026-10-08", referenceE1rm: 250 },
    ]);
    expect(series.find((pattern) => pattern.pattern === "hinge")?.points).toEqual([
      { date: "2026-10-08", referenceE1rm: 400 },
    ]);
  });
});
