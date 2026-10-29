import { describe, expect, it } from "vitest";
import { parseWindowDateRange } from "./window-range";

describe("parseWindowDateRange", () => {
  it("accepts a range longer than the reporting cap", () => {
    expect(parseWindowDateRange({ from: "2023-01-01", to: "2025-06-01" })).toEqual({
      ok: true,
      from: "2023-01-01",
      to: "2025-06-01",
    });
  });

  it("accepts the same day and trims spaces", () => {
    expect(parseWindowDateRange({ from: " 2025-03-15 ", to: "2025-03-15" })).toEqual({
      ok: true,
      from: "2025-03-15",
      to: "2025-03-15",
    });
  });

  it("rejects missing, invalid, and reversed dates", () => {
    expect(parseWindowDateRange({ from: "", to: "2025-01-01" }).ok).toBe(false);
    expect(parseWindowDateRange({ from: "2025-02-31", to: "2025-03-01" }).ok).toBe(false);
    expect(parseWindowDateRange({ from: "2025-01-10", to: "2025-01-01" }).ok).toBe(false);
  });
});
