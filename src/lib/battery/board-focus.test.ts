import { describe, expect, it } from "vitest";
import { boardFocusDay } from "./board-focus";

const days = [
  { day_key: "A", closed_at: "2026-11-16" },
  { day_key: "B", closed_at: null },
  { day_key: "C", closed_at: null },
];

describe("boardFocusDay", () => {
  it("follows the first open day for today", () => {
    expect(boardFocusDay(days, "today")?.day_key).toBe("B");
  });

  it("ranks a closed day on its own when that day is chosen", () => {
    expect(boardFocusDay(days, "day", "A")?.day_key).toBe("A");
    expect(boardFocusDay(days, "day", "C")?.day_key).toBe("C");
    expect(boardFocusDay(days, "day", "Z")).toBeNull();
  });

  it("does not pin the meet to one day", () => {
    expect(boardFocusDay(days, "meet", "A")).toBeNull();
  });
});
