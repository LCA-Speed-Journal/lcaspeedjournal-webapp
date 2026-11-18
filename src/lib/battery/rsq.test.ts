import { describe, expect, it } from "vitest";
import { averageRsiAttempts, groupRsiAttempts, rsqPoint, rsqQuadrant } from "./rsq";

describe("rsqQuadrant", () => {
  it("puts the crosshair in Compliant and the upper left in Reactive", () => {
    expect(rsqQuadrant(10, 200)).toBe("compliant");
    expect(rsqQuadrant(12, 180)).toBe("reactive");
    expect(rsqQuadrant(8, 180)).toBe("stiff");
    expect(rsqQuadrant(8, 250)).toBe("developing");
  });
});

describe("rsqPoint", () => {
  it("maps 10 inches and 200 ms to the middle of the plot", () => {
    expect(rsqPoint(10, 200)).toEqual({ x: 0.5, y: 0.5 });
    expect(rsqPoint(20, 0).y).toBe(0);
    expect(rsqPoint(0, 400).x).toBe(1);
  });
});

describe("groupRsiAttempts", () => {
  it("keeps a high jump with its own slow contact", () => {
    const attempts = groupRsiAttempts([
      { metric_key: "10-5_RSI", display_value: 1.5, created_at: 0 },
      { metric_key: "10-5_JH", display_value: 18, created_at: 1 },
      { metric_key: "10-5_GCT", display_value: 280, created_at: 2 },
      { metric_key: "10-5_RSI", display_value: 2.4, created_at: 10 },
      { metric_key: "10-5_JH", display_value: 11, created_at: 11 },
      { metric_key: "10-5_GCT", display_value: 140, created_at: 12 },
    ]);
    expect(attempts).toEqual([
      { jump: 18, gct: 280 },
      { jump: 11, gct: 140 },
    ]);
    expect(averageRsiAttempts(attempts)).toEqual({ jump: 14.5, gct: 210 });
  });

  it("drops an attempt that is missing jump or contact", () => {
    expect(
      groupRsiAttempts([
        { metric_key: "10-5_RSI", display_value: 2, created_at: 0 },
        { metric_key: "10-5_JH", display_value: 12, created_at: 1 },
      ])
    ).toEqual([]);
    expect(averageRsiAttempts([])).toBeNull();
  });

  it("pairs a hop-test jump and contact the same way", () => {
    const attempts = groupRsiAttempts([
      { metric_key: "Hop-Test_RSI", display_value: 1.8, created_at: 0 },
      { metric_key: "Hop-Test_JH", display_value: 16, created_at: 0 },
      { metric_key: "Hop-Test_GCT", display_value: 190, created_at: 1 },
    ]);
    expect(attempts).toEqual([{ jump: 16, gct: 190 }]);
  });

  it("keeps the jump when it shares the RSI timestamp", () => {
    expect(
      groupRsiAttempts([
        { metric_key: "10-5_RSI", display_value: 2, created_at: 0 },
        { metric_key: "10-5_JH", display_value: 15, created_at: 0 },
        { metric_key: "10-5_GCT", display_value: 180, created_at: 1 },
      ])
    ).toEqual([{ jump: 15, gct: 180 }]);
  });
});
