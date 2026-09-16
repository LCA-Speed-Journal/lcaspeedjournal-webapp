import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCoachSession = vi.fn();
const buildTeamProgressPayload = vi.fn();

vi.mock("@/lib/require-coach", () => ({
  requireCoachSession: (...args: unknown[]) => requireCoachSession(...args),
}));

vi.mock("@/lib/team-progress/build-payload", () => ({
  buildTeamProgressPayload: (...args: unknown[]) =>
    buildTeamProgressPayload(...args),
}));

import { GET } from "./route";

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/reporting/team-progress", () => {
  beforeEach(() => {
    requireCoachSession.mockReset();
    buildTeamProgressPayload.mockReset();
    requireCoachSession.mockResolvedValue({ ok: true });
    buildTeamProgressPayload.mockResolvedValue({
      hugo_group: "football",
      from: "2026-08-01",
      to: "2026-11-30",
      roster_count: 0,
      athletes_with_tests: 0,
      tests: [],
      available_extra_metrics: [],
      lifts: [],
      iso_rocks: [],
      f2f: { athletes: [] },
      athletes: [],
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireCoachSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const res = await GET(
      req("/api/reporting/team-progress?hugo_group=football&from=2026-08-01&to=2026-11-30")
    );
    expect(res.status).toBe(401);
  });

  it("rejects missing hugo_group and overlong ranges", async () => {
    let res = await GET(
      req("/api/reporting/team-progress?from=2026-01-01&to=2026-06-01")
    );
    expect(res.status).toBe(400);

    res = await GET(
      req(
        "/api/reporting/team-progress?hugo_group=football&from=2025-01-01&to=2026-06-01"
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/12 months/i);
  });

  it("returns payload for a valid request", async () => {
    const res = await GET(
      req(
        "/api/reporting/team-progress?hugo_group=football&from=2026-08-01&to=2026-11-30&extra_metric=UH-MB_Throw"
      )
    );
    expect(res.status).toBe(200);
    expect(buildTeamProgressPayload).toHaveBeenCalledWith({
      hugoGroup: "football",
      from: "2026-08-01",
      to: "2026-11-30",
      addedMetrics: ["UH-MB_Throw"],
      f2fMode: "latest",
    });
    const body = await res.json();
    expect(body.data.hugo_group).toBe("football");
  });

  it("passes f2f_mode=best through to the payload builder", async () => {
    const res = await GET(
      req(
        "/api/reporting/team-progress?hugo_group=football&from=2026-08-01&to=2026-11-30&f2f_mode=best"
      )
    );
    expect(res.status).toBe(200);
    expect(buildTeamProgressPayload).toHaveBeenCalledWith({
      hugoGroup: "football",
      from: "2026-08-01",
      to: "2026-11-30",
      addedMetrics: [],
      f2fMode: "best",
    });
  });
});
