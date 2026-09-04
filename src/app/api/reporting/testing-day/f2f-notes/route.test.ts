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

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function textOf(strings: TemplateStringsArray): string {
  return strings.raw.join(" ");
}

function jsonOf(res: Response) {
  return res.json() as Promise<{ data?: unknown; error?: string }>;
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/reporting/testing-day/f2f-notes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/reporting/testing-day/f2f-notes", () => {
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
    const res = await PATCH(
      patchReq({
        session_id: SESSION_ID,
        notes: { session: "Session takeaway" },
      })
    );
    expect(res.status).toBe(401);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Unauthorized" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("rejects an unknown theme note key before touching the database", async () => {
    const res = await PATCH(
      patchReq({
        session_id: SESSION_ID,
        notes: { unknown: "nope" },
      })
    );
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/unknown|key/i);
    expect(sql).not.toHaveBeenCalled();
  });

  it("merges notes into the session and returns the merged object", async () => {
    const merged = {
      session: "new session",
      "soccer|M": "keep me",
    };
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("SELECT") && text.includes("f2f_theme_notes")) {
        return {
          rows: [
            {
              id: SESSION_ID,
              f2f_theme_notes: {
                session: "old session",
                "soccer|M": "keep me",
                "soccer|F": "remove me",
              },
            },
          ],
        };
      }
      if (text.includes("UPDATE") && text.includes("f2f_theme_notes")) {
        return { rows: [{ f2f_theme_notes: merged }] };
      }
      return { rows: [] };
    });

    const res = await PATCH(
      patchReq({
        session_id: SESSION_ID,
        notes: {
          session: "new session",
          "soccer|F": "",
        },
      })
    );

    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({ data: merged });

    const updateCall = sql.mock.calls.find((call) =>
      textOf(call[0] as TemplateStringsArray).includes("UPDATE")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.slice(1)).toEqual(
      expect.arrayContaining([SESSION_ID, JSON.stringify(merged)])
    );
  });
});
