import { describe, expect, it } from "vitest";
import { QUIET_AFTER_MS, stillRefreshing } from "./quiet-refresh";

describe("stillRefreshing", () => {
  it("keeps polling until the marks have been identical for 10 minutes", () => {
    const changedAt = Date.parse("2026-11-17T15:00:00Z");
    expect(stillRefreshing(changedAt, changedAt + QUIET_AFTER_MS - 1)).toBe(true);
    expect(stillRefreshing(changedAt, changedAt + QUIET_AFTER_MS)).toBe(false);
  });
});
