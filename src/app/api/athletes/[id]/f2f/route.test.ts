import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { F2fProfile } from "@/lib/norms/f2f/types";

const sql = vi.fn();
const buildF2fProfile = vi.fn();

vi.mock("@/lib/db", () => ({
  sql: (...args: unknown[]) => sql(...args),
}));

vi.mock("@/lib/norms/f2f/profile", () => ({
  buildF2fProfile: (...args: unknown[]) => buildF2fProfile(...args),
}));

import { GET } from "./route";

const ATHLETE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function textOf(strings: TemplateStringsArray): string {
  return strings.raw.join(" ");
}

function jsonOf(res: Response) {
  return res.json() as Promise<{
    error?: string;
    data?: {
      mode?: string;
      composed?: boolean;
      as_of?: string | null;
      f2f?: F2fProfile | null;
    };
  }>;
}

function getReq(query = "") {
  const suffix = query ? `?${query}` : "";
  return new NextRequest(
    `http://localhost/api/athletes/${ATHLETE_ID}/f2f${suffix}`
  );
}

const context = { params: Promise.resolve({ id: ATHLETE_ID }) };

const stubProfile: F2fProfile = {
  reference_40: 5,
  reference_source: "actual_40",
  explosion: null,
  force: null,
  form: null,
  eligible_for_labels: false,
  flags: [],
  primary: null,
};

function mockAthleteAndEntries(
  gender: string | null,
  entries: unknown[] = []
) {
  sql.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = textOf(strings);
    if (text.includes("FROM athletes")) {
      return gender == null ? { rows: [] } : { rows: [{ gender }] };
    }
    if (text.includes("FROM entries")) {
      return { rows: entries };
    }
    return { rows: [] };
  });
}

describe("GET /api/athletes/[id]/f2f", () => {
  beforeEach(() => {
    sql.mockReset();
    buildF2fProfile.mockReset();
    buildF2fProfile.mockReturnValue(stubProfile);
  });

  it("returns 404 when the athlete is missing", async () => {
    mockAthleteAndEntries(null);
    const res = await GET(getReq("mode=full-test"), context);
    expect(res.status).toBe(404);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Athlete not found" });
  });

  it("defaults to full-test when mode is missing", async () => {
    mockAthleteAndEntries("M");
    const res = await GET(getReq(), context);
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data?.mode).toBe("full-test");
    expect(body.data?.composed).toBe(false);
    expect(body.data?.f2f).toEqual(stubProfile);
  });

  it("defaults to full-test when mode is invalid", async () => {
    mockAthleteAndEntries("M");
    const res = await GET(getReq("mode=nope"), context);
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data?.mode).toBe("full-test");
  });

  it("returns 200 with f2f null when the engine throws", async () => {
    mockAthleteAndEntries("M");
    buildF2fProfile.mockImplementation(() => {
      throw new Error("engine down");
    });
    const res = await GET(getReq("mode=best"), context);
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data).toEqual({
      mode: "best",
      composed: true,
      as_of: null,
      f2f: null,
    });
  });
});
