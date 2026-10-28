import { describe, expect, it } from "vitest";
import { dropoffLine, summarizeDropoff } from "./summarize";

describe("dropoffLine", () => {
  it("puts a time line above the best", () => {
    expect(dropoffLine(10.42, "time")).toBe(11.05);
    expect(dropoffLine(1.7, "time")).toBe(1.8);
  });

  it("puts a score line below the best", () => {
    expect(dropoffLine(28.5, "score")).toBe(26.79);
  });
});

describe("summarizeDropoff", () => {
  it("returns null when there is no positive attempt", () => {
    expect(summarizeDropoff([], "time")).toBeNull();
    expect(summarizeDropoff([0, Number.NaN], "score")).toBeNull();
  });

  it("counts a single attempt as above the line and not crossed", () => {
    expect(summarizeDropoff([1.7], "time")).toEqual({
      initial: 1.7,
      dropoffLine: 1.8,
      dropoffPercent: 6,
      attemptsAboveLine: 1,
      crossedDropoff: false,
    });
  });

  it("marks a later time that is slower than the line", () => {
    const summary = summarizeDropoff([1.7, 1.75, 1.85], "time");
    expect(summary).toMatchObject({
      initial: 1.7,
      dropoffLine: 1.8,
      attemptsAboveLine: 2,
      crossedDropoff: true,
    });
  });

  it("marks a later jump that is shorter than the line", () => {
    const summary = summarizeDropoff([28.5, 27, 26], "score");
    expect(summary).toMatchObject({
      initial: 28.5,
      dropoffLine: 26.79,
      attemptsAboveLine: 2,
      crossedDropoff: true,
    });
  });

  it("resets the line on a new best and does not call the old attempt a cross", () => {
    const summary = summarizeDropoff([2, 1.7], "time");
    expect(summary).toMatchObject({
      initial: 1.7,
      dropoffLine: 1.8,
      attemptsAboveLine: 1,
      crossedDropoff: false,
    });
  });

  it("keeps the crossed flag after a later attempt comes back inside the line", () => {
    const summary = summarizeDropoff([1.7, 1.9, 1.72], "time");
    expect(summary).toMatchObject({
      attemptsAboveLine: 2,
      crossedDropoff: true,
    });
  });

  it("treats a value equal to the line as still good", () => {
    const summary = summarizeDropoff([1.7, 1.8], "time");
    expect(summary).toMatchObject({
      attemptsAboveLine: 2,
      crossedDropoff: false,
    });
  });
});
