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

function getReq(query: string) {
  return new NextRequest(`http://localhost/api/norms/thresholds?${query}`);
}

function putReq(query: string, body: unknown) {
  return new NextRequest(`http://localhost/api/norms/thresholds?${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sliceQuery = `population_id=${POP_ID}&metric_key=${encodeURIComponent("Vertical Jump")}`;

describe("GET /api/norms/thresholds", () => {
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
    const res = await GET(getReq(sliceQuery));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 400 when population_id is missing", async () => {
    const res = await GET(getReq("metric_key=Vertical%20Jump"));
    expect(res.status).toBe(400);
  });

  it("returns filled cells for the slice", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_thresholds")) {
        return {
          rows: [
            {
              gender: "F",
              label: "efficient",
              threshold: "20.0",
              component: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await GET(getReq(sliceQuery));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data).toEqual([
      { gender: "F", label: "efficient", threshold: 20, component: null },
    ]);
  });
});

describe("PUT /api/norms/thresholds", () => {
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
    const res = await PUT(putReq(sliceQuery, []));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 400 when two labels share a cut for the same gender", async () => {
    const res = await PUT(
      putReq(sliceQuery, [
        { gender: "M", label: "efficient", threshold: 5 },
        { gender: "M", label: "elite", threshold: 5 },
      ])
    );
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/unique|duplicate/i);
    expect(sql).not.toHaveBeenCalled();
  });

  it("replaces the slice in one CTE write after the population lookup", async () => {
    const writes: Array<{ text: string; values: unknown[] }> = [];
    sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations") && !text.includes("DELETE FROM")) {
        return { rows: [{ id: POP_ID, archived_at: null }] };
      }
      writes.push({ text, values });
      return { rows: [] };
    });

    const cells = [{ gender: "F", label: "efficient", threshold: 20 }];
    const res = await PUT(putReq(sliceQuery, cells));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].text).toMatch(/DELETE FROM norm_thresholds/i);
    expect(writes[0].text).toMatch(/RETURNING/i);
    expect(writes[0].text).toMatch(/CROSS JOIN/i);
    expect(writes[0].text).toMatch(/INSERT INTO norm_thresholds/i);
    expect(writes[0].text).toMatch(/json_to_recordset/i);
    expect(writes[0].values).toContain(JSON.stringify(cells));
    const body = await jsonOf(res);
    expect(body.data).toEqual([
      { gender: "F", label: "efficient", threshold: 20, component: null },
    ]);
  });

  it("empty body still uses one CTE write (delete + empty recordset)", async () => {
    const writes: string[] = [];
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = textOf(strings);
      if (text.includes("FROM norm_populations") && !text.includes("DELETE FROM")) {
        return { rows: [{ id: POP_ID, archived_at: null }] };
      }
      writes.push(text);
      return { rows: [] };
    });

    const res = await PUT(putReq(sliceQuery, []));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/DELETE FROM norm_thresholds/i);
    expect(writes[0]).toMatch(/RETURNING/i);
    expect(writes[0]).toMatch(/CROSS JOIN/i);
    expect(writes[0]).toMatch(/json_to_recordset/i);
    await expect(jsonOf(res)).resolves.toEqual({ data: [] });
  });
});
