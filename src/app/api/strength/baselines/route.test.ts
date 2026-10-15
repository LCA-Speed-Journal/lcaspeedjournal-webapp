import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCoachSession = vi.fn();
const saveAnchorBaselines = vi.fn();
const editBaseline = vi.fn();
const listBaselines = vi.fn();

vi.mock("@/lib/require-coach", () => ({
  requireCoachSession: (...args: unknown[]) => requireCoachSession(...args),
}));

vi.mock("@/lib/strength/baselines", () => ({
  saveAnchorBaselines: (...args: unknown[]) => saveAnchorBaselines(...args),
  editBaseline: (...args: unknown[]) => editBaseline(...args),
  listBaselines: (...args: unknown[]) => listBaselines(...args),
}));

import { GET, PATCH, PUT } from "./route";

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

function jsonReq(method: "PUT" | "PATCH", body: unknown) {
  return new NextRequest("http://localhost:3000/api/strength/baselines", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/strength/baselines", () => {
  beforeEach(() => {
    requireCoachSession.mockReset();
    saveAnchorBaselines.mockReset();
    editBaseline.mockReset();
    listBaselines.mockReset();
    requireCoachSession.mockResolvedValue({ ok: true });
    listBaselines.mockResolvedValue([]);
    saveAnchorBaselines.mockResolvedValue([
      {
        athlete_id: "abc",
        pattern: "squat",
        value_lb: 300,
        origin: "anchor",
      },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    requireCoachSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const res = await GET(
      req("http://localhost:3000/api/strength/baselines?athlete_id=abc")
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(listBaselines).not.toHaveBeenCalled();
  });

  it("returns 400 when GET has neither athlete_id nor hugo_group", async () => {
    const res = await GET(req("http://localhost:3000/api/strength/baselines"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Provide athlete_id or hugo_group");
    expect(listBaselines).not.toHaveBeenCalled();
  });

  it("returns 400 when hugo_group is invalid", async () => {
    const res = await GET(
      req("http://localhost:3000/api/strength/baselines?hugo_group=not-a-group")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid hugo_group");
    expect(listBaselines).not.toHaveBeenCalled();
  });

  it("returns 400 when PATCH pattern is unknown", async () => {
    const res = await PATCH(
      jsonReq("PATCH", { athlete_id: "abc", pattern: "curl", value_lb: 100 })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unknown pattern");
    expect(editBaseline).not.toHaveBeenCalled();
  });

  it("returns 200 PUT and calls the writer", async () => {
    const res = await PUT(
      jsonReq("PUT", {
        athlete_id: "abc",
        squat: 300,
        bench: 200,
        power: 100,
      })
    );
    expect(res.status).toBe(200);
    expect(saveAnchorBaselines).toHaveBeenCalledWith({
      athleteId: "abc",
      squat: 300,
      bench: 200,
      power: 100,
    });
    const body = await res.json();
    expect(body.data).toEqual([
      {
        athlete_id: "abc",
        pattern: "squat",
        value_lb: 300,
        origin: "anchor",
      },
    ]);
  });
});
