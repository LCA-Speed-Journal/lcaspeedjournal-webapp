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

  it('parses inch mark with " suffix as output', () => {
    expect(parseLoadReps('19.6"')).toMatchObject({
      kind: "output",
      load: 19.6,
      units: "in",
    });
    expect(parseLoadReps("19.6″")).toMatchObject({
      kind: "output",
      load: 19.6,
      units: "in",
    });
    expect(parseLoadReps('22.5 "')).toMatchObject({
      kind: "output",
      load: 22.5,
      units: "in",
    });
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

  it("parses duration seconds including /leg and ranges", () => {
    expect(parseLoadReps("45s")).toMatchObject({
      kind: "duration",
      load: 45,
      units: "s",
    });
    expect(parseLoadReps("45s/leg")).toMatchObject({
      kind: "duration",
      load: 45,
      units: "s",
    });
    // Ranges: use the upper bound so progression charts see the prescription ceiling
    expect(parseLoadReps("45–60s")).toMatchObject({
      kind: "duration",
      load: 60,
      units: "s",
    });
    expect(parseLoadReps("45-60s")).toMatchObject({
      kind: "duration",
      load: 60,
      units: "s",
    });
  });

  it("parses side/count doses as reps kind (not volume load_reps)", () => {
    expect(parseLoadReps("15/side")).toMatchObject({
      kind: "reps",
      reps: 15,
      load: null,
    });
    expect(parseLoadReps("×15")).toMatchObject({
      kind: "reps",
      reps: 15,
    });
    expect(parseLoadReps("x15")).toMatchObject({
      kind: "reps",
      reps: 15,
    });
  });

  it("parses p/ea and /ea as reps or duration per-each", () => {
    expect(parseLoadReps("15/ea")).toMatchObject({
      kind: "reps",
      reps: 15,
    });
    expect(parseLoadReps("15 p/ea")).toMatchObject({
      kind: "reps",
      reps: 15,
    });
    expect(parseLoadReps("45s/ea")).toMatchObject({
      kind: "duration",
      load: 45,
      units: "s",
    });
    expect(parseLoadReps("45s p/ea")).toMatchObject({
      kind: "duration",
      load: 45,
      units: "s",
    });
  });

  it("parses BW with reps", () => {
    expect(parseLoadReps("BW x8")).toMatchObject({
      kind: "bw",
      reps: 8,
    });
    expect(parseLoadReps("BWx10")).toMatchObject({
      kind: "bw",
      reps: 10,
    });
    expect(parseLoadReps("bw × 12")).toMatchObject({
      kind: "bw",
      reps: 12,
    });
  });

  it("parses drill distance volume ft/yd/m", () => {
    expect(parseLoadReps("10yd")).toMatchObject({
      kind: "distance",
      load: 10,
      units: "yd",
    });
    expect(parseLoadReps("30 ft")).toMatchObject({
      kind: "distance",
      load: 30,
      units: "ft",
    });
    expect(parseLoadReps("5m")).toMatchObject({
      kind: "distance",
      load: 5,
      units: "m",
    });
    expect(parseLoadReps("2x10yd")).toMatchObject({
      kind: "distance",
      load: 10,
      reps: 2,
      units: "yd",
    });
    expect(parseLoadReps("2 × 30 yd")).toMatchObject({
      kind: "distance",
      load: 30,
      reps: 2,
      units: "yd",
    });
  });
});
