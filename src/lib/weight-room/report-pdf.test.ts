import { describe, it, expect } from "vitest";
import { renderWeightRoomReportPdf } from "./report-pdf";
import type { WeightRoomReport } from "./report-aggregate";

describe("renderWeightRoomReportPdf", () => {
  it("renders an empty report as a PDF buffer", async () => {
    const report: WeightRoomReport = {
      hugo_group: "soccer",
      from: "2026-09-08",
      to: "2026-09-14",
      sessionDates: [],
      attendanceByDate: [],
      athletes: [],
    };
    const buf = await renderWeightRoomReportPdf({
      report,
      heading: "Soccer team report",
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
