import { describe, it, expect } from "vitest";
import { parseLoadReps } from "./parse-load-reps";

describe("parseLoadReps", () => {
  it("parses 185x5", () => {
    expect(parseLoadReps("185x5")).toEqual({
      raw: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
      units: "lb",
    });
  });

  it("parses 185 x 5 and 185lbs 5", () => {
    expect(parseLoadReps("185 x 5").kind).toBe("load_reps");
    expect(parseLoadReps("185 x 5").load).toBe(185);
    expect(parseLoadReps("185lbs 5").load).toBe(185);
    expect(parseLoadReps("185lbs 5").reps).toBe(5);
  });

  it("parses BW", () => {
    expect(parseLoadReps("BW").kind).toBe("bw");
    expect(parseLoadReps("body weight").kind).toBe("bw");
  });

  it("parses AMRAP 12", () => {
    const r = parseLoadReps("AMRAP 12");
    expect(r.kind).toBe("amrap");
    expect(r.reps).toBe(12);
    expect(r.load).toBeNull();
  });

  it("parses jump inches as output", () => {
    const r = parseLoadReps("22.5 in");
    expect(r.kind).toBe("output");
    expect(r.load).toBe(22.5);
    expect(r.units).toBe("in");
  });

  it("empty and garbage stay unknown with raw preserved", () => {
    expect(parseLoadReps("").kind).toBe("unknown");
    expect(parseLoadReps("  ").kind).toBe("unknown");
    const g = parseLoadReps("felt good");
    expect(g.kind).toBe("unknown");
    expect(g.raw).toBe("felt good");
    expect(g.load).toBeNull();
  });

  it("does not guess a lone number as reps; locks in and ×", () => {
    expect(parseLoadReps("12").kind).toBe("unknown");

    const inches = parseLoadReps("12 in");
    expect(inches.kind).toBe("output");
    expect(inches.load).toBe(12);
    expect(inches.units).toBe("in");

    const multiply = parseLoadReps("185×5");
    expect(multiply.kind).toBe("load_reps");
    expect(multiply.load).toBe(185);
    expect(multiply.reps).toBe(5);
  });
});
