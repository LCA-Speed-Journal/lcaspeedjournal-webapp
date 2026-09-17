import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import {
  entryPresenceKey,
  journalPostsForFillIfMissing,
  parseJournalPostsBody,
} from "./weight-room-journal";

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
        { movement_id: "m1", metric_key: "Vertical Jump", component: null, post: true },
        { movement_id: "m2", metric_key: "Standing-Broad", component: null, post: false },
      ],
    });
  });

  it("parses an empty array", () => {
    expect(parseJournalPostsBody([])).toEqual({ ok: true, value: [] });
  });
});

describe("entryPresenceKey", () => {
  it("joins metric key and component with ::", () => {
    expect(entryPresenceKey("Vertical Jump", null)).toBe("Vertical Jump::");
    expect(entryPresenceKey("Vertical Jump", undefined)).toBe("Vertical Jump::");
    expect(entryPresenceKey("Vertical Jump", "")).toBe("Vertical Jump::");
    expect(entryPresenceKey("40yd_Dash", "10yd")).toBe("40yd_Dash::10yd");
  });
});

describe("journalPostsForFillIfMissing", () => {
  const cmj = {
    id: "mov-cmj",
    speed_journal_metric_key: "Vertical Jump",
    speed_journal_component: null as string | null,
  };
  const unmapped = {
    id: "mov-squat",
    speed_journal_metric_key: null as string | null,
  };
  const emptyMapped = {
    id: "mov-empty",
    speed_journal_metric_key: "" as string | null,
  };

  it("posts mapped CMJ when no existing entry for that metric", () => {
    const posts = journalPostsForFillIfMissing({
      movements: [cmj, unmapped, emptyMapped],
      existingKeys: new Set(),
    });
    expect(posts).toEqual([
      {
        movement_id: "mov-cmj",
        metric_key: "Vertical Jump",
        component: null,
        post: true,
      },
    ]);
  });

  it("does not post mapped CMJ when Vertical Jump:: already exists", () => {
    const posts = journalPostsForFillIfMissing({
      movements: [cmj],
      existingKeys: new Set(["Vertical Jump::"]),
    });
    const cmjPost = posts.find((p) => p.movement_id === "mov-cmj");
    if (cmjPost) {
      expect(cmjPost.post).toBe(false);
    } else {
      expect(posts).toEqual([]);
    }
  });

  it("skips unmapped movements", () => {
    expect(
      journalPostsForFillIfMissing({
        movements: [unmapped, emptyMapped],
        existingKeys: new Set(),
      })
    ).toEqual([]);
  });
});
