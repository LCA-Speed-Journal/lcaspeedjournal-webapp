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

import { PATCH } from "./route";

const POP_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_ID = "33333333-3333-4333-8333-333333333333";

function textOf(strings: TemplateStringsArray): string {
  return strings.raw.join(" ");
}

function jsonOf(res: Response) {
  return res.json() as Promise<{ data?: unknown; error?: string }>;
}

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/norms/populations/${POP_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const existing = {
  id: POP_ID,
  name: "HS Volleyball VJ",
  notes: null,
  archived_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

describe("PATCH /api/norms/populations/:id", () => {
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
    const res = await PATCH(patchReq({ name: "Renamed" }), ctx(POP_ID));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    sql.mockResolvedValue({ rows: [] });
    const res = await PATCH(patchReq({ name: "Renamed" }), ctx(MISSING_ID));
    expect(res.status).toBe(404);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Population not found" });
  });

  it("renames and updates notes", async () => {
    const updated = { ...existing, name: "Renamed", notes: "keep" };
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations")) {
        return { rows: [existing] };
      }
      if (text.includes("UPDATE norm_populations")) {
        return { rows: [updated] };
      }
      return { rows: [] };
    });

    const res = await PATCH(patchReq({ name: "Renamed", notes: "keep" }), ctx(POP_ID));
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({ data: updated });
  });

  it("returns 409 when archiving a population still used as a default", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations")) {
        return { rows: [existing] };
      }
      if (text.includes("norm_sport_defaults")) {
        return { rows: [{ n: 1 }] };
      }
      return { rows: [] };
    });

    const res = await PATCH(patchReq({ archived: true }), ctx(POP_ID));
    expect(res.status).toBe(409);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/default/i);
  });

  it("archives when no sport defaults point here", async () => {
    const archived = {
      ...existing,
      archived_at: "2026-08-31T12:00:00.000Z",
    };
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations")) {
        return { rows: [existing] };
      }
      if (text.includes("norm_sport_defaults")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("UPDATE norm_populations")) {
        return { rows: [archived] };
      }
      return { rows: [] };
    });

    const res = await PATCH(patchReq({ archived: true }), ctx(POP_ID));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data).toMatchObject({ archived_at: archived.archived_at });
  });

  it("unarchives by setting archived_at null", async () => {
    const archived = { ...existing, archived_at: "2026-08-01T00:00:00.000Z" };
    const live = { ...existing, archived_at: null };
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations")) {
        return { rows: [archived] };
      }
      if (text.includes("UPDATE norm_populations")) {
        return { rows: [live] };
      }
      return { rows: [] };
    });

    const res = await PATCH(patchReq({ archived: false }), ctx(POP_ID));
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({ data: live });
  });
});
