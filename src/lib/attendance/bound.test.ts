import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBoundContests } from "./bound";

describe("parseBoundContests", () => {
  it("keeps varsity contests and drops other levels and cancellations", () => {
    const html = readFileSync(new URL("./bound-fixture.html", import.meta.url), "utf8");
    const rows = parseBoundContests(html);
    expect(rows.map((r) => `${r.hugo_group}:${r.contest_date}`).sort()).toEqual([
      "football:2026-10-02",
      "soccer:2026-10-06",
      "womens_tennis:2026-10-08",
      "xc:2026-10-09",
    ]);
  });
});
