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

import { GET, POST } from "./route";

const POP_ID = "11111111-1111-4111-8111-111111111111";

function textOf(strings: TemplateStringsArray): string {
  return strings.raw.join(" ");
}

function jsonOf(res: Response) {
  return res.json() as Promise<{ data?: unknown; error?: string }>;
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/norms/populations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/norms/populations", () => {
  beforeEach(() => {
    sql.mockReset();
    requireCoachSession.mockReset();
  });

  it("is public: returns id+name without requiring a coach session", async () => {
    sql.mockResolvedValue({
      rows: [{ id: POP_ID, name: "HS Volleyball VJ" }],
    });
    const res = await GET();
    expect(requireCoachSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({
      data: [{ id: POP_ID, name: "HS Volleyball VJ" }],
    });
  });
});

describe("POST /api/norms/populations", () => {
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
    const res = await POST(postReq({ name: "New Table" }));
    expect(res.status).toBe(401);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Unauthorized" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(postReq({ notes: "x" }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/name/i);
    expect(sql).not.toHaveBeenCalled();
  });

  it("creates a population and returns 201", async () => {
    const created = {
      id: POP_ID,
      name: "HS VJ",
      notes: "x",
      archived_at: null,
      created_at: "2026-08-31T00:00:00.000Z",
    };
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("INSERT INTO norm_populations")) {
        return { rows: [created] };
      }
      return { rows: [] };
    });

    const res = await POST(postReq({ name: "  HS VJ  ", notes: "  x  " }));
    expect(res.status).toBe(201);
    await expect(jsonOf(res)).resolves.toEqual({ data: created });
  });

  it("returns 400 on duplicate name", async () => {
    sql.mockImplementation(async () => {
      const err = new Error("duplicate key value violates unique constraint") as Error & {
        code?: string;
      };
      err.code = "23505";
      throw err;
    });
    const res = await POST(postReq({ name: "HS Volleyball VJ" }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/already exists|duplicate/i);
  });
});
