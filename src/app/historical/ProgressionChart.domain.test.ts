import { describe, expect, it } from "vitest";
import { yDomainFromValues } from "@/app/historical/ProgressionChart";

describe("yDomainFromValues", () => {
  it("includes min and max with padding so a 50–65 series is not clipped", () => {
    const [lo, hi] = yDomainFromValues([50, 65]);
    expect(lo).toBeLessThan(50);
    expect(hi).toBeGreaterThan(65);
  });

  it("expands a tight 5.00–5.10 band instead of collapsing to one tick", () => {
    const [lo, hi] = yDomainFromValues([5.1, 5.0]);
    expect(lo).toBeLessThan(5.0);
    expect(hi).toBeGreaterThan(5.1);
    expect(hi - lo).toBeGreaterThan(0.1);
  });
});
