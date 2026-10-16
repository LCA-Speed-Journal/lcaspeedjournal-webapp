import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCoachSession = vi.fn();
const loadWorkingWeightTable = vi.fn();

vi.mock("@/lib/require-coach", () => ({
  requireCoachSession: (...args: unknown[]) => requireCoachSession(...args),
}));

vi.mock("@/lib/strength/working-weight-table", () => ({
  loadWorkingWeightTable: (...args: unknown[]) =>
    loadWorkingWeightTable(...args),
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { GET } from "./route";

const FOOTBALL_TEMPLATE = "22222222-2222-2222-2222-222222222222";
const EXTRA_TEMPLATE = "11111111-1111-1111-1111-111111111111";

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/strength/working-weights", () => {
  beforeEach(() => {
    requireCoachSession.mockReset();
    loadWorkingWeightTable.mockReset();
    requireCoachSession.mockResolvedValue({ ok: true });
    loadWorkingWeightTable.mockResolvedValue({
      ok: true,
      data: {
        session_date: "2026-10-15",
        athletes: [],
        rows: [],
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireCoachSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const res = await GET(
      req(
        `http://localhost:3000/api/strength/working-weights?template_id=${EXTRA_TEMPLATE}`
      )
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(loadWorkingWeightTable).not.toHaveBeenCalled();
  });

  it("returns 400 when template_id is missing", async () => {
    const res = await GET(
      req("http://localhost:3000/api/strength/working-weights")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("template_id is required and must be a UUID");
    expect(loadWorkingWeightTable).not.toHaveBeenCalled();
  });

  it("returns 400 when template_id is not a UUID", async () => {
    const res = await GET(
      req(
        "http://localhost:3000/api/strength/working-weights?template_id=football"
      )
    );
    expect(res.status).toBe(400);
    expect(loadWorkingWeightTable).not.toHaveBeenCalled();
  });

  it("returns 404 when the loader reports the template is not extracurricular", async () => {
    loadWorkingWeightTable.mockImplementation(async (templateId: string) => {
      if (templateId === FOOTBALL_TEMPLATE) {
        return { ok: false, status: 404, error: "Template not found" };
      }
      return {
        ok: true,
        data: { session_date: "2026-10-15", athletes: [], rows: [] },
      };
    });

    const res = await GET(
      req(
        `http://localhost:3000/api/strength/working-weights?template_id=${FOOTBALL_TEMPLATE}`
      )
    );
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.error).toBe("Template not found");
    expect(body.data).toBeUndefined();
    expect(loadWorkingWeightTable).toHaveBeenCalledWith(FOOTBALL_TEMPLATE);
  });

  it("returns 404 when the loader reports the template is missing", async () => {
    loadWorkingWeightTable.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Template not found",
    });
    const res = await GET(
      req(
        `http://localhost:3000/api/strength/working-weights?template_id=${EXTRA_TEMPLATE}`
      )
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.data).toBeUndefined();
  });
});
