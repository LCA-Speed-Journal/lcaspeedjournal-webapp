import { describe, expect, it } from "vitest";
import {
  boardPageCount,
  boardPageSpan,
  cutoffAfterIndex,
  fitLabelSize,
  fitSubtextSize,
  fitSharedSize,
  formatDelta,
  formatDeltaLine,
  formatMark,
  orderBoard,
  pageItems,
  phoneColumnTemplate,
  phoneGridWidth,
  podiumBox,
  shortName,
} from "./BatteryBoard";
import type { BoardAthlete } from "@/lib/battery/load";

function athlete(index: number, points: number, slots = 1): BoardAthlete {
  return {
    athlete_id: `a${index}`,
    bib: String(index),
    first_name: "A",
    last_name: String(index).padStart(2, "0"),
    group_key: null,
    total_points: points,
    rank_points: 0,
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
    expect(kinds).toEqual([11, 12, 13, 14, 15, 16, 17, 18, "cutoff", 19, 20]);
  });

  it("splits a roster into balanced pages of about ten", () => {
    expect(boardPageCount(0)).toBe(1);
    expect(boardPageSpan(0, 0)).toEqual({ start: 0, size: 0 });
    expect(boardPageCount(10)).toBe(1);
    expect(boardPageSpan(10, 0)).toEqual({ start: 0, size: 10 });
    expect(boardPageSpan(11, 0)).toEqual({ start: 0, size: 6 });
    expect(boardPageSpan(11, 1)).toEqual({ start: 6, size: 5 });
    expect(boardPageSpan(20, 1)).toEqual({ start: 10, size: 10 });
    expect(boardPageSpan(22, 0)).toEqual({ start: 0, size: 8 });
    expect(boardPageSpan(22, 1)).toEqual({ start: 8, size: 7 });
    expect(boardPageSpan(22, 2)).toEqual({ start: 15, size: 7 });
    expect(boardPageSpan(23, 0).size).toBe(8);
    expect(boardPageSpan(23, 1).size).toBe(8);
    expect(boardPageSpan(23, 2).size).toBe(7);
    expect(boardPageCount(40)).toBe(4);
    expect(boardPageSpan(40, 3)).toEqual({ start: 30, size: 10 });
  });

  it("keeps Top 18 and Teams on the same balanced pages", () => {
    const athletes = Array.from({ length: 22 }, (_, index) => athlete(index + 1, 100 - index));
    const rows = orderBoard(athletes, []);
    const line = cutoffAfterIndex(rows, 18);
    const top18 = pageItems(rows, 0, line);
    const teams = pageItems(rows, 0, null);
    expect(top18.filter((item) => item.kind === "row")).toHaveLength(8);
    expect(top18.some((item) => item.kind === "cutoff")).toBe(false);
    expect(teams.filter((item) => item.kind === "row")).toHaveLength(8);
    expect(teams.some((item) => item.kind === "cutoff")).toBe(false);
    const last = pageItems(rows, 2, line);
    expect(last.filter((item) => item.kind === "row")).toHaveLength(7);
    expect(last.some((item) => item.kind === "cutoff")).toBe(true);
  });

  it("keeps athletes with the same shown points tied", () => {
    const levi = athlete(1, 23, 5);
    levi.rank_points = 0.07;
    const sawyer = athlete(2, 23, 5);
    sawyer.rank_points = 0.03;
    const rows = orderBoard([sawyer, levi], []);
    expect(rows.map((row) => row.place)).toEqual([1, 1]);
  });

  it("orders athletes who show zero by their hidden ranking points", () => {
    const ninth = athlete(2, 0, 2);
    ninth.rank_points = 0.5;
    const twelfth = athlete(1, 0, 2);
    twelfth.rank_points = 1 / 16;
    const rows = orderBoard([twelfth, ninth], []);
    expect(rows.map((row) => row.athlete.athlete_id)).toEqual(["a2", "a1"]);
    expect(rows.map((row) => row.place)).toEqual([1, 2]);
    expect(rows.every((row) => row.athlete.total_points === 0)).toBe(true);
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
    expect(secondPage.filter((item) => item.kind === "row")).toHaveLength(7);
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

  it("keeps one mark size inside the row and inside every column", () => {
    const widthOf = (label: string, size: number) => label.length * size * 0.5;
    const nameAt = (size: number) => widthOf("Jacob Schlict", size) + 18;
    const markAt = (size: number) => widthOf("19.2mph", size) + size * 0.9;
    const fitted = fitSharedSize(2000, 50, 5, 80, 20, nameAt, markAt);
    expect(fitted.size + 20 + 8).toBeLessThanOrEqual(50.5);
    const open = fitSharedSize(2000, 50, 5, 80, 0, nameAt, markAt);
    expect(open.size).toBeGreaterThan(fitted.size);
    const packed = fitSharedSize(1000, 80, 5, 80, 16, nameAt, markAt);
    const name = nameAt(packed.size);
    const column = (1000 - 80 - name) / 5;
    expect(markAt(packed.size) + 8).toBeLessThanOrEqual(column + 0.5);
    expect(packed.nameWidth).toBe(Math.ceil(name));
  });

  it("caps the name column at 30% of the board when no marks are entered", () => {
    const widthOf = (label: string, size: number) => label.length * size * 0.6;
    const nameAt = (size: number) => widthOf("Christopher Williamson", size) + 18;
    const board = 1600;
    const empty = fitSharedSize(board, 400, 4, 80, 0, nameAt, () => 0);
    expect(empty.nameWidth).toBeLessThanOrEqual(board * 0.3);
    expect(empty.nameWidth).toBeGreaterThan(48);
    const marked = fitSharedSize(board, 80, 4, 80, 16, nameAt, (size) => widthOf("19.2mph", size));
    expect(marked.nameWidth).toBeLessThanOrEqual(board * 0.3);
    expect(marked.nameWidth).toBe(Math.ceil(nameAt(marked.size)));
  });

  it("grows a name until the widest label or the bib line stops it", () => {
    const widthOf = (label: string, size: number) => label.length * size * 0.5;
    expect(fitLabelSize(["Al", "Christopher"], 80, 100, widthOf)).toBeCloseTo(14.5, 0);
    expect(fitLabelSize(["Al"], 400, 80, widthOf)).toBe(64);
    expect(fitLabelSize(["Christopher"], 20, 80, widthOf)).toBe(14);
  });

  it("uses one smaller subtext size when the widest line would clip", () => {
    const widthOf = (label: string, size: number) => label.length * size * 0.5;
    expect(fitSubtextSize(["-0.1"], 80, widthOf)).toBe(11);
    expect(fitSubtextSize(["Pretty Springy", "-0.2"], 52, widthOf)).toBeLessThan(11);
    expect(fitSubtextSize(["Pretty Springy", "Elite"], 52, widthOf)).toBe(
      fitSubtextSize(["Pretty Springy"], 52, widthOf)
    );
    const size = fitSubtextSize(["Pretty Springy"], 52, widthOf);
    expect(widthOf("Pretty Springy", size)).toBeLessThanOrEqual(52);
  });

  it("locks every podium outline to the column width and the tallest stack", () => {
    const box = podiumBox(196, 50);
    expect(box.width).toBe(184);
    expect(box.height).toBe(66);
    expect(box.cellHeight).toBe(box.height + 12);
    expect(podiumBox(196, 37)).not.toEqual(box);
    expect(podiumBox(196, 50).width).toBe(podiumBox(196, 20).width);
  });

  it("shortens a phone name to the first name and last initial", () => {
    expect(shortName("Jax", "Triana")).toBe("Jax T.");
    expect(shortName("Jimmy", "Youtsey")).toBe("Jimmy Y.");
    expect(shortName("  ", "")).toBe("Athlete");
  });

  it("gives a phone board a fixed name and real metric columns", () => {
    expect(phoneColumnTemplate(5)).toBe(
      "2.25rem 6rem repeat(5, 4.75rem) 2.75rem"
    );
    expect(phoneGridWidth(5)).toBe("34.75rem");
  });
});
