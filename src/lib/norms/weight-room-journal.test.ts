import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { parseJournalPostsBody } from "./weight-room-journal";

describe("parseJournalPostsBody", () => {
  it("defaults to an empty array when journal_posts is missing", () => {
    expect(parseJournalPostsBody(undefined)).toEqual({ ok: true, value: [] });
    expect(parseJournalPostsBody(null)).toEqual({ ok: true, value: [] });
  });

  it("returns an error for non-array types", () => {
    const bad = [
      parseJournalPostsBody("nope"),
      parseJournalPostsBody(1),
      parseJournalPostsBody({ movement_id: "m1", metric_key: "Vertical Jump", post: true }),
    ];
    for (const result of bad) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/journal_posts/i);
      }
    }
  });

  it("keeps valid posts and ignores invalid items", () => {
    const result = parseJournalPostsBody([
      { movement_id: "m1", metric_key: "Vertical Jump", post: true },
      { movement_id: 1, metric_key: "Vertical Jump", post: true },
      "skip",
      null,
      { movement_id: "m2", metric_key: "Standing-Broad", post: false },
      { movement_id: "m3", metric_key: "Vertical Jump" },
      { movement_id: "m4", post: true },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        { movement_id: "m1", metric_key: "Vertical Jump", post: true },
        { movement_id: "m2", metric_key: "Standing-Broad", post: false },
      ],
    });
  });

  it("parses an empty array", () => {
    expect(parseJournalPostsBody([])).toEqual({ ok: true, value: [] });
  });
});
