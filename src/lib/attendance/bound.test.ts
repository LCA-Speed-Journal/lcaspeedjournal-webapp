import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  boundScheduleUrl,
  parseBoundContests,
  parseVarsityScheduleTable,
} from "./bound";

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

describe("parseVarsityScheduleTable", () => {
  const html = `
    <table class="table table-sm">
      <tr><th>Date</th><th>Opponent(s)</th></tr>
      <tr>
        <td>8/28/26</td>
        <td><span class="mr-1">vs</span><a href="/direct/teams/abc/show">St. Paul Academy</a></td>
      </tr>
      <tr>
        <td>9/22/26</td>
        <td><span class="mr-1">vs</span><a href="/direct/teams/def/show">United Christian</a></td>
      </tr>
      <tr>
        <td>9/22/26</td>
        <td><span class="mr-1">vs</span><a href="/direct/teams/def/show">United Christian</a></td>
      </tr>
      <tr>
        <td>10/3/26</td>
        <td><span class="mr-1">@</span><a href="/direct/teams/ghi/show">Breck</a></td>
      </tr>
      <tr>
        <td>10/3/26</td>
        <td><span class="mr-1">@</span><a href="/direct/teams/jkl/show">Minnehaha</a></td>
      </tr>
      <tr>
        <td>10/9/26</td>
        <td><span class="mr-1">vs</span><a href="/direct/teams/mno/show">Cancelled Opponent</a></td>
        <td>Cancelled</td>
      </tr>
      <tr>
        <td>1/12/27</td>
        <td><span class="mr-1">@</span><a href="/direct/teams/pqr/show">Winter Opponent</a></td>
      </tr>
    </table>
  `;

  it("keeps one varsity date per day and reads two-digit years", () => {
    const rows = parseVarsityScheduleTable(html, "volleyball");
    expect(rows.map((row) => `${row.contest_date} ${row.label}`)).toEqual([
      "2026-08-28 vs St. Paul Academy",
      "2026-09-22 vs United Christian",
      "2026-10-03 @ Breck, @ Minnehaha",
      "2027-01-12 @ Winter Opponent",
    ]);
    expect(rows.every((row) => row.hugo_group === "volleyball")).toBe(true);
    expect(rows.every((row) => row.bound_key.startsWith("volleyball:"))).toBe(true);
  });

  it("points football at the St. Agnes co-op schedule", () => {
    expect(boundScheduleUrl("football")).toBe(
      "https://www.gobound.com/mn/mshsl/fb/2026-27/stagnes/v/schedule",
    );
    expect(boundScheduleUrl("volleyball")).toContain("/lclassical/v/schedule");
    expect(boundScheduleUrl("womens_tennis")).toBe(
      "https://www.gobound.com/mn/schools/lclassical",
    );
  });
});
