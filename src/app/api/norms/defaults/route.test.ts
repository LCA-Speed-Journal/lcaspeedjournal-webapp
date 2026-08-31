import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sql = vi.fn();
const requireCoachSession = vi.fn();

vi.mock("@/lib/db", () => ({
  sql: (...args: unknown[]) => sql(...args),
}));

vi.mock("@/lib/require-coach", () => ({
  requireCoachSession: (...args: unknown[]) => requireCoachSession(...args),
}));

import { GET, PUT } from "./route";

const POP_ID = "11111111-1111-4111-8111-111111111111";

function textOf(strings: TemplateStringsArray): string {
  return strings.raw.join(" ");
}

function jsonOf(res: Response) {
  return res.json() as Promise<{ data?: unknown; error?: string }>;
}

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/norms/defaults", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/norms/defaults", () => {
  beforeEach(() => {
    sql.mockReset();
    requireCoachSession.mockReset();
    requireCoachSession.mockResolvedValue({ ok: true });
  });

  it("returns 401 when the coach is not signed in", async () => {
    requireCoachSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns all default rows", async () => {
    const rows = [
      {
        hugo_group: "football",
        metric_key: "40yd_Dash",
        population_id: POP_ID,
      },
    ];
    sql.mockResolvedValue({ rows });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({ data: rows });
  });
});

describe("PUT /api/norms/defaults", () => {
  beforeEach(() => {
    sql.mockReset();
    requireCoachSession.mockReset();
    requireCoachSession.mockResolvedValue({ ok: true });
  });

  it("returns 401 when the coach is not signed in", async () => {
    requireCoachSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const res = await PUT(putReq({ hugo_group: "soccer", metric_key: "40yd_Dash", population_id: null }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown hugo_group", async () => {
    const res = await PUT(
      putReq({
        hugo_group: "lacrosse",
        metric_key: "40yd_Dash",
        population_id: null,
      })
    );
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/hugo_group/i);
    expect(sql).not.toHaveBeenCalled();
  });

  it("upserts a default when the population exists and is not archived", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations")) {
        return { rows: [{ id: POP_ID, archived_at: null }] };
      }
      if (text.includes("norm_sport_defaults")) {
        return {
          rows: [
            {
              hugo_group: "football",
              metric_key: "40yd_Dash",
              population_id: POP_ID,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await PUT(
      putReq({
        hugo_group: "football",
        metric_key: "40yd_Dash",
        population_id: POP_ID,
      })
    );
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({
      data: {
        hugo_group: "football",
        metric_key: "40yd_Dash",
        population_id: POP_ID,
      },
    });
  });

  it("returns 400 when the population is archived", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations")) {
        return {
          rows: [{ id: POP_ID, archived_at: "2026-08-01T00:00:00.000Z" }],
        };
      }
      return { rows: [] };
    });

    const res = await PUT(
      putReq({
        hugo_group: "football",
        metric_key: "40yd_Dash",
        population_id: POP_ID,
      })
    );
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/archiv/i);
  });

  it("returns 404 when the population does not exist", async () => {
    sql.mockResolvedValue({ rows: [] });
    const res = await PUT(
      putReq({
        hugo_group: "football",
        metric_key: "40yd_Dash",
        population_id: POP_ID,
      })
    );
    expect(res.status).toBe(404);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Population not found" });
  });

  it("deletes the row when population_id is null", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("DELETE FROM norm_sport_defaults")) {
        return { rows: [{ hugo_group: "xc", metric_key: "Vertical Jump" }] };
      }
      return { rows: [] };
    });

    const res = await PUT(
      putReq({
        hugo_group: "xc",
        metric_key: "Vertical Jump",
        population_id: null,
      })
    );
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({
      data: {
        hugo_group: "xc",
        metric_key: "Vertical Jump",
        population_id: null,
      },
    });
  });
});
