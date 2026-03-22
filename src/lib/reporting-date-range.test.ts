import { describe, it, expect } from "vitest";
import { parseReportingDateRange } from "./reporting-date-range";

describe("parseReportingDateRange", () => {
  it("rejects missing from", () => {
    const r = parseReportingDateRange({ from: "", to: "2025-01-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/from/i);
    }
  });

  it("rejects missing to", () => {
    const r = parseReportingDateRange({ from: "2025-01-01", to: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects invalid date strings", () => {
    const r = parseReportingDateRange({ from: "not-a-date", to: "2025-01-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects when from > to", () => {
    const r = parseReportingDateRange({ from: "2025-01-10", to: "2025-01-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects range wider than max months", () => {
    const r = parseReportingDateRange({ from: "2023-01-01", to: "2025-06-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/24|month/i);
    }
  });

  it("accepts valid same-day range", () => {
    const r = parseReportingDateRange({ from: "2025-03-15", to: "2025-03-15" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.from).toBe("2025-03-15");
      expect(r.to).toBe("2025-03-15");
    }
  });

  it("accepts valid range within cap and normalizes whitespace", () => {
    const r = parseReportingDateRange({ from: " 2025-01-01 ", to: " 2025-12-31 " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.from).toBe("2025-01-01");
      expect(r.to).toBe("2025-12-31");
    }
  });

  it("accepts null as missing", () => {
    const r = parseReportingDateRange({ from: null, to: "2025-01-01" });
    expect(r.ok).toBe(false);
  });
});
