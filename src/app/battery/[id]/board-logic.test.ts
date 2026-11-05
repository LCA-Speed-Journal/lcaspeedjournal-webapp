import { describe, expect, it } from "vitest";
import { cutoffAfterIndex, formatDelta, formatDeltaLine, formatMark, orderBoard, pageItems, shortName } from "./BatteryBoard";
import type { BoardAthlete } from "@/lib/battery/load";

function athlete(index: number, points: number, slots = 1): BoardAthlete {
  return {
    athlete_id: `a${index}`,
    bib: String(index),
    first_name: "A",
    last_name: String(index).padStart(2, "0"),
    group_key: null,
    total_points: points,
    slots_completed: slots,
    qualifier: null,
    higher_box: false,
    cells: { "Standing-Broad": { value: 7, rank: 1, tied: false, points: 1 } },
  };
}

describe("gym board order", () => {
  it("puts the cutoff between 18 and 19 when 20 athletes have marks", () => {
    const athletes = Array.from({ length: 20 }, (_, index) => athlete(index + 1, 100 - index));
    const rows = orderBoard(athletes, []);
    expect(rows.map((row) => row.place)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    const line = cutoffAfterIndex(rows, 18);
    expect(line).toBe(17);
    const secondPage = pageItems(rows, 1, line);
    const kinds = secondPage.map((item) => (item.kind === "row" ? item.row.place : item.kind));
    expect(kinds).toEqual([13, 14, 15, 16, 17, 18, "cutoff", 19, 20]);
  });

  it("shares a place when tied athletes are not adjacent in the payload", () => {
    const rows = orderBoard(
      [athlete(3, 10, 2), athlete(2, 4, 2), athlete(1, 10, 2)],
      []
    );
    expect(rows.map((row) => row.athlete.athlete_id)).toEqual(["a1", "a3", "a2"]);
    expect(rows.map((row) => row.place)).toEqual([1, 1, 3]);
  });

  it("repeats the not-tested label when a page starts in the untested block", () => {
    const tested = [athlete(1, 10)];
    const waiting = Array.from({ length: 14 }, (_, index) => athlete(100 + index, 0, 0));
    const rows = orderBoard(
      [...tested, ...waiting],
      waiting.map((row) => row.athlete_id)
    );
    const secondPage = pageItems(rows, 1, null);
    expect(secondPage[0]?.kind).toBe("untested");
    expect(secondPage.filter((item) => item.kind === "row")).toHaveLength(3);
  });

  it("keeps a tie on the cutoff above the line and skips the next place", () => {
    const athletes = [
      ...Array.from({ length: 17 }, (_, index) => athlete(index + 1, 100 - index)),
      athlete(18, 10, 2),
      athlete(19, 10, 2),
      athlete(20, 9, 2),
    ];
    const rows = orderBoard(athletes, []);
    expect(rows[17]?.place).toBe(18);
    expect(rows[18]?.place).toBe(18);
    expect(rows[19]?.place).toBe(20);
    expect(cutoffAfterIndex(rows, 18)).toBe(18);
  });

  it("does not draw a line when fewer than the cutoff have a mark", () => {
    const tested = Array.from({ length: 4 }, (_, index) => athlete(index + 1, 10 - index));
    const waiting = athlete(5, 0, 0);
    const rows = orderBoard([...tested, waiting], [waiting.athlete_id]);
    expect(cutoffAfterIndex(rows, 18)).toBeNull();
    expect(rows.filter((row) => !row.untested)).toHaveLength(4);
    expect(rows.at(-1)?.untested).toBe(true);
    expect(rows.at(-1)?.place).toBeNull();
  });

  it("formats a sprint hundredth and a one-decimal jump", () => {
    expect(formatDelta(-0.06)).toBe("-0.06");
    expect(formatDelta(0.4)).toBe("+0.4");
    expect(formatDelta(12.4)).toBe("+12");
  });

  it("adds the percent of the previous mark beside the change", () => {
    expect(formatDeltaLine(-0.3, 5.1)).toBe("-0.3 (-6%)");
    expect(formatDeltaLine(1.5, 19.9)).toBe("+1.5 (+8%)");
    expect(formatDeltaLine(-0.04, 5.2)).toBe("-0.04 (-1%)");
    expect(formatDeltaLine(0.4, 0)).toBe("+0.4");
  });

  it("adds the unit the gym reads on a projected mark", () => {
    expect(formatMark(2.96, "s")).toBe("2.96s");
    expect(formatMark(19.2, "mph")).toBe("19.2mph");
    expect(formatMark(2.74, "RSI")).toBe("2.74");
    expect(formatMark(2.48, "DRI")).toBe("2.48");
    expect(formatMark(7.5, "ft")).toBe("7'6\"");
    expect(formatMark(33.7, "in")).toBe("33.7in.");
    expect(formatMark(11.15, "%")).toBe("11.2%");
  });

  it("shortens a phone name to the first name and last initial", () => {
    expect(shortName("Jax", "Triana")).toBe("Jax T.");
    expect(shortName("Jimmy", "Youtsey")).toBe("Jimmy Y.");
    expect(shortName("  ", "")).toBe("Athlete");
  });
});
