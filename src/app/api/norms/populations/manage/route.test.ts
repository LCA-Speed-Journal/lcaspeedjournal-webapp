import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();
const requireCoachSession = vi.fn();

vi.mock("@/lib/db", () => ({
  sql: (...args: unknown[]) => sql(...args),
}));

vi.mock("@/lib/require-coach", () => ({
  requireCoachSession: (...args: unknown[]) => requireCoachSession(...args),
}));

import { GET } from "./route";

const POP_ID = "11111111-1111-4111-8111-111111111111";
const ARCHIVED_ID = "22222222-2222-4222-8222-222222222222";

function jsonOf(res: Response) {
  return res.json() as Promise<{ data?: unknown; error?: string }>;
}

describe("GET /api/norms/populations/manage", () => {
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
    await expect(jsonOf(res)).resolves.toEqual({ error: "Unauthorized" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns notes and archived populations for coaches", async () => {
    const rows = [
      {
        id: POP_ID,
        name: "HS Volleyball VJ",
        notes: "VJ stick",
        archived_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: ARCHIVED_ID,
        name: "Old Table",
        notes: null,
        archived_at: "2026-08-15T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ];
    sql.mockResolvedValue({ rows });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({ data: rows });
  });
});
