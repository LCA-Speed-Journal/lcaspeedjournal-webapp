import { describe, expect, it } from "vitest";
import { teamProgressPdfFilename } from "./pdf";
import type { TeamProgressPayload } from "./build-payload";
import { renderTeamProgressPdf } from "./pdf";

const emptyPayload: TeamProgressPayload = {
  hugo_group: "football",
  from: "2026-08-01",
  to: "2026-11-30",
  roster_count: 12,
  athletes_with_tests: 0,
  tests: [],
  available_extra_metrics: [],
  lifts: [],
  iso_rocks: [],
  f2f: { athletes: [], end_mode: "latest" },
  athletes: [],
};

describe("team progress PDF", () => {
  it("builds a filename and renders a non-empty buffer", async () => {
    expect(teamProgressPdfFilename("football", "2026-08-01", "2026-11-30")).toBe(
      "team-progress-football-2026-08-01_2026-11-30.pdf"
    );
    const buf = await renderTeamProgressPdf(emptyPayload);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);
});
