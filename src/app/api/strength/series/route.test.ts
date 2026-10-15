import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCoachSession = vi.fn();
const loadStrengthSeries = vi.fn();

vi.mock("@/lib/require-coach", () => ({
  requireCoachSession: (...args: unknown[]) => requireCoachSession(...args),
}));

vi.mock("@/lib/strength/load-sets", () => ({
  loadStrengthSeries: (...args: unknown[]) => loadStrengthSeries(...args),
}));

import { GET } from "./route";

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/strength/series", () => {
  beforeEach(() => {
    requireCoachSession.mockReset();
    loadStrengthSeries.mockReset();
    requireCoachSession.mockResolvedValue({ ok: true });
    loadStrengthSeries.mockResolvedValue({
      athletes: [{ athlete_id: "abc", patterns: [] }],
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireCoachSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const res = await GET(
      req("http://localhost:3000/api/strength/series?athlete_id=abc")
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(loadStrengthSeries).not.toHaveBeenCalled();
  });

  it("returns 400 when no athlete or group is given", async () => {
    const res = await GET(req("http://localhost:3000/api/strength/series"));
    expect(res.status).toBe(400);
    expect(loadStrengthSeries).not.toHaveBeenCalled();
  });

  it("returns 400 when hugo_group is invalid", async () => {
    const res = await GET(
      req(
        "http://localhost:3000/api/strength/series?hugo_group=not-a-group&from=2026-08-01&to=2026-10-01"
      )
    );
    expect(res.status).toBe(400);
    expect(loadStrengthSeries).not.toHaveBeenCalled();
  });

  it("returns 200 for a valid athlete_id and calls the loader", async () => {
    const res = await GET(
      req("http://localhost:3000/api/strength/series?athlete_id=abc")
    );
    expect(res.status).toBe(200);
    expect(loadStrengthSeries).toHaveBeenCalledWith({ athleteId: "abc" });
    const body = await res.json();
    expect(body.data.athletes).toEqual([
      { athlete_id: "abc", patterns: [] },
    ]);
    expect(body.data.median).toBeUndefined();
  });

  it("returns the roster series and median for a hugo group", async () => {
    loadStrengthSeries.mockResolvedValue({
      athletes: [{ athlete_id: "abc", patterns: [] }],
      median: [{ pattern: "squat", points: [] }],
    });
    const res = await GET(
      req(
        "http://localhost:3000/api/strength/series?hugo_group=football&from=2026-08-01&to=2026-10-01"
      )
    );
    expect(res.status).toBe(200);
    expect(loadStrengthSeries).toHaveBeenCalledWith({
      hugoGroup: "football",
      from: "2026-08-01",
      to: "2026-10-01",
    });
    const body = await res.json();
    expect(body.data.median).toEqual([{ pattern: "squat", points: [] }]);
  });
});
