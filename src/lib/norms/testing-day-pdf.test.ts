import { describe, it, expect } from "vitest";
import {
  boardForAudience,
  renderTestingDayPdf,
  testingDayPdfFilename,
} from "./testing-day-pdf";
import type { TestingDayBoardData } from "./testing-day";

const poorBoard: TestingDayBoardData = {
  session_id: "s1",
  session_date: "2026-09-02",
  phase: "Preseason",
  selected_population_id: null,
  matrix: {
    columns: [
      {
        key: "Vertical Jump\0",
        metric_key: "Vertical Jump",
        display_name: "Vertical Jump",
        component: null,
        units: "in",
      },
    ],
    athletes: [
      {
        athlete_id: "a",
        first_name: "Ann",
        last_name: "Aye",
        gender: "F",
        sport: "volleyball",
        cells: {
          "Vertical Jump\0": {
            display_value: 16,
            zone_label: "poor",
            zone_color: "#dc2626",
            rank: 1,
            tied: false,
            points: 10,
          },
        },
        total_points: 10,
      },
    ],
  },
  tests: [
    {
      column_key: "Vertical Jump\0",
      metric: "Vertical Jump",
      metric_display_name: "Vertical Jump",
      component: null,
      units: "in",
      groups: [],
    },
  ],
};

describe("boardForAudience", () => {
  it("strips poor badges and summaries for athletes", () => {
    const athlete = boardForAudience(poorBoard, "athlete");
    expect(athlete.tests).toEqual([]);
    expect(athlete.matrix.athletes[0].cells["Vertical Jump\0"].zone_label).toBeUndefined();
    expect(boardForAudience(poorBoard, "coach").tests).toHaveLength(1);
  });
});

describe("testingDayPdfFilename", () => {
  it("names coach and athlete attachments", () => {
    expect(testingDayPdfFilename("2026-09-02", "coach")).toBe(
      "testing-day-2026-09-02-coach.pdf"
    );
  });
});

describe("renderTestingDayPdf", () => {
  it("renders an empty board as a PDF buffer", async () => {
    const buf = await renderTestingDayPdf({
      board: {
        ...poorBoard,
        matrix: { columns: [], athletes: [] },
        tests: [],
      },
      audience: "coach",
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
