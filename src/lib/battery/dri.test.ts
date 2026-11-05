import { describe, expect, it } from "vitest";
import { driBand, higherBoxFlag, pickTeamDriBox } from "./dri";

describe("driBand", () => {
  it("puts boundary marks in the higher band, and 3.0 stays Bouncy", () => {
    expect(driBand(0.49).label).toBe("Warming Up");
    expect(driBand(0.5).label).toBe("Rebound Ready");
    expect(driBand(1.24).label).toBe("Rebound Ready");
    expect(driBand(1.25).label).toBe("Pretty Springy");
    expect(driBand(2).label).toBe("Bouncy");
    expect(driBand(3).label).toBe("Bouncy");
    expect(driBand(3.01).label).toBe("Elite");
  });
});

describe("pickTeamDriBox", () => {
  it("picks the box with the highest median", () => {
    const box = pickTeamDriBox([
      { box: "6", value: 0.4 },
      { box: "12", value: 1.8 },
      { box: "12", value: 2.2 },
      { box: "18", value: 1.2 },
      { box: "18", value: 1.4 },
    ]);
    expect(box).toBe("12");
  });

  it("uses the lower box when medians tie", () => {
    const box = pickTeamDriBox([
      { box: "12", value: 2 },
      { box: "18", value: 2 },
    ]);
    expect(box).toBe("12");
  });
});

describe("higherBoxFlag", () => {
  it("flags a personal peak above the team box", () => {
    expect(higherBoxFlag("18", "12")).toBe(true);
    expect(higherBoxFlag("24", "12")).toBe(true);
    expect(higherBoxFlag("12", "12")).toBe(false);
    expect(higherBoxFlag("6", "12")).toBe(false);
  });
});
