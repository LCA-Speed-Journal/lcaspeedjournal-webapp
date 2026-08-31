import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  sql: (...args: unknown[]) => sql(...args),
}));

import { GET } from "./route";

const VJ_POP = "11111111-1111-4111-8111-111111111111";
const FORTY_POP = "22222222-2222-4222-8222-222222222222";
const MISSING_POP = "33333333-3333-4333-8333-333333333333";

const VB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function textOf(strings: TemplateStringsArray): string {
  return strings.raw.join(" ");
}

function jsonOf(res: Response) {
  return res.json() as Promise<{
    error?: string;
    data?: {
      rows: Array<Record<string, unknown>>;
      male?: Array<Record<string, unknown>>;
      female?: Array<Record<string, unknown>>;
      populations?: Array<{ id: string; name: string }>;
      selected_population_id?: string | null;
    };
  }>;
}

function req(query: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/leaderboard/historical?${query}`
  );
}

const vjEntry = {
  rank: 1,
  athlete_id: VB_ID,
  first_name: "Val",
  last_name: "Ball",
  gender: "F",
  athlete_type: "athlete",
  display_value: 22,
  units: "in",
};

const fortyEntry = {
  rank: 1,
  athlete_id: SC_ID,
  first_name: "Sam",
  last_name: "Cut",
  gender: "M",
  athlete_type: "athlete",
  display_value: 4.5,
  units: "s",
};

type SqlBags = {
  populations?: unknown[];
  entries?: unknown[];
  memberships?: unknown[];
  defaults?: unknown[];
  thresholds?: unknown[];
  throwOn?: "populations" | "memberships" | "defaults" | "thresholds";
};

function mockSql(bags: SqlBags) {
  sql.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = textOf(strings);
    if (text.includes("norm_populations")) {
      if (bags.throwOn === "populations") throw new Error("populations down");
      return { rows: bags.populations ?? [] };
    }
    if (text.includes("athlete_hugo_memberships")) {
      if (bags.throwOn === "memberships") throw new Error("memberships down");
      return { rows: bags.memberships ?? [] };
    }
    if (text.includes("norm_sport_defaults")) {
      if (bags.throwOn === "defaults") throw new Error("defaults down");
      return { rows: bags.defaults ?? [] };
    }
    if (text.includes("norm_thresholds")) {
      if (bags.throwOn === "thresholds") throw new Error("thresholds down");
      return { rows: bags.thresholds ?? [] };
    }
    return { rows: bags.entries ?? [] };
  });
}

describe("GET /api/leaderboard/historical population_id", () => {
  beforeEach(() => {
    sql.mockReset();
  });

  it("returns 400 for a non-UUID override", async () => {
    const res = await GET(
      req("from=2026-01-01&to=2026-12-31&metric=Vertical Jump&population_id=not-a-uuid")
    );
    expect(res.status).toBe(400);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Invalid population_id" });
  });

  it("returns 400 when the override is missing from the public list", async () => {
    mockSql({
      populations: [{ id: VJ_POP, name: "HS Volleyball VJ" }],
      entries: [vjEntry],
    });
    const res = await GET(
      req(
        `from=2026-01-01&to=2026-12-31&metric=Vertical Jump&population_id=${MISSING_POP}`
      )
    );
    expect(res.status).toBe(400);
    await expect(jsonOf(res)).resolves.toEqual({ error: "Population not found" });
  });
});

describe("GET /api/leaderboard/historical current-stick zones", () => {
  beforeEach(() => {
    sql.mockReset();
  });

  it("attaches zones from sport defaults using live cuts", async () => {
    mockSql({
      populations: [{ id: VJ_POP, name: "HS Volleyball VJ" }],
      entries: [vjEntry],
      memberships: [
        { athlete_id: VB_ID, hugo_group: "volleyball", is_primary: true },
      ],
      defaults: [
        {
          hugo_group: "volleyball",
          metric_key: "Vertical Jump",
          population_id: VJ_POP,
        },
      ],
      thresholds: [
        {
          population_id: VJ_POP,
          gender: "F",
          component: "",
          label: "efficient",
          threshold: "20.0",
        },
      ],
    });

    const res = await GET(
      req("from=2026-01-01&to=2026-12-31&metric=Vertical Jump")
    );
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data?.selected_population_id).toBeNull();
    expect(body.data?.populations).toEqual([
      { id: VJ_POP, name: "HS Volleyball VJ" },
    ]);
    expect(body.data?.rows[0]).toMatchObject({
      athlete_id: VB_ID,
      zone_label: "efficient",
      zone_color: "#ca8a04",
      population_name: "HS Volleyball VJ",
      population_id: VJ_POP,
    });
    expect(body.data?.female?.[0]).toMatchObject({ zone_label: "efficient" });
  });

  it("uses the historical primary component so 40yd cuts match", async () => {
    mockSql({
      populations: [{ id: FORTY_POP, name: "Football Skill 40yd" }],
      entries: [fortyEntry],
      memberships: [
        { athlete_id: SC_ID, hugo_group: "soccer", is_primary: true },
      ],
      defaults: [
        {
          hugo_group: "soccer",
          metric_key: "40yd_Dash",
          population_id: FORTY_POP,
        },
      ],
      thresholds: [
        {
          population_id: FORTY_POP,
          gender: "M",
          component: "0-40yd",
          label: "elite",
          threshold: 4.5,
        },
      ],
    });

    const res = await GET(
      req("from=2026-01-01&to=2026-12-31&metric=40yd_Dash")
    );
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data?.rows[0]).toMatchObject({
      zone_label: "elite",
      zone_color: "#2563eb",
      population_name: "Football Skill 40yd",
    });
  });

  it("override paints every athlete with that table", async () => {
    mockSql({
      populations: [{ id: FORTY_POP, name: "Football Skill 40yd" }],
      entries: [
        { ...fortyEntry, athlete_id: VB_ID, first_name: "Val", gender: "M" },
        { ...fortyEntry, rank: 2, athlete_id: SC_ID },
      ],
      memberships: [],
      defaults: [],
      thresholds: [
        {
          population_id: FORTY_POP,
          gender: "M",
          component: "0-40yd",
          label: "elite",
          threshold: 4.5,
        },
      ],
    });

    const res = await GET(
      req(
        `from=2026-01-01&to=2026-12-31&metric=40yd_Dash&population_id=${FORTY_POP}`
      )
    );
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data?.selected_population_id).toBe(FORTY_POP);
    expect(body.data?.rows).toHaveLength(2);
    for (const row of body.data?.rows ?? []) {
      expect(row.zone_label).toBe("elite");
    }
  });

  it("omits zones when memberships SQL fails but still returns ranks", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSql({
      populations: [{ id: VJ_POP, name: "HS Volleyball VJ" }],
      entries: [vjEntry],
      throwOn: "memberships",
    });

    const res = await GET(
      req("from=2026-01-01&to=2026-12-31&metric=Vertical Jump")
    );
    errorSpy.mockRestore();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data?.rows[0]).toMatchObject({
      athlete_id: VB_ID,
      rank: 1,
      display_value: 22,
    });
    expect(body.data?.rows[0].zone_label).toBeUndefined();
    expect(body.data?.populations).toEqual([
      { id: VJ_POP, name: "HS Volleyball VJ" },
    ]);
  });
});
