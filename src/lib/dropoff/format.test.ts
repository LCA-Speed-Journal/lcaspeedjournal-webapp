import { describe, expect, it } from "vitest";
import { attemptPastLine, formatDropoffCaption } from "./format";

describe("formatDropoffCaption", () => {
  it("prints the best and the line", () => {
    expect(
      formatDropoffCaption({
        initial: 10.42,
        dropoffLine: 11.05,
        dropoffPercent: 6,
        attemptsAboveLine: 3,
        crossedDropoff: false,
      })
    ).toBe("Best 10.42 · Line 11.05 · 3 above");
  });

  it("adds a past-the-line note when a later attempt crossed", () => {
    expect(
      formatDropoffCaption({
        initial: 28.5,
        dropoffLine: 26.79,
        dropoffPercent: 6,
        attemptsAboveLine: 2,
        crossedDropoff: true,
      })
    ).toBe("Best 28.50 · Line 26.79 · 2 above · Past the line");
  });
});

describe("attemptPastLine", () => {
  it("is false for a time still at or under the line", () => {
    expect(attemptPastLine(1.8, 1.8, "time")).toBe(false);
    expect(attemptPastLine(1.81, 1.8, "time")).toBe(true);
  });

  it("is false for a jump still at or above the line", () => {
    expect(attemptPastLine(26.79, 26.79, "score")).toBe(false);
    expect(attemptPastLine(26.7, 26.79, "score")).toBe(true);
  });
});
