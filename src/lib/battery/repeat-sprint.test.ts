import { describe, expect, it } from "vitest";
import { scoreRepeatSprint } from "./repeat-sprint";

describe("scoreRepeatSprint", () => {
  it("scores a full set of ten", () => {
    const times = [1.7, ...Array(9).fill(1.9)];
    const scored = scoreRepeatSprint(times);
    expect(scored).not.toBeNull();
    expect(scored!.best).toBeCloseTo(1.7);
    expect(scored!.mean).toBeCloseTo(1.88);
    expect(scored!.decrement).toBeCloseTo(10.588, 2);
  });

  it("returns null until all ten reps exist", () => {
    expect(scoreRepeatSprint([1.7, 1.8])).toBeNull();
  });

  it("scores ten identical reps as zero decrement", () => {
    const scored = scoreRepeatSprint(Array(10).fill(1.8));
    expect(scored!.decrement).toBeCloseTo(0);
  });
});
