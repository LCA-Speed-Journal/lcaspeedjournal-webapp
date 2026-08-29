import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { requireCoachSession } from "./require-coach";

describe("requireCoachSession", () => {
  it("returns unauthorized when session is null", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const r = await requireCoachSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("returns ok when session exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Coach" } } as never);
    const r = await requireCoachSession();
    expect(r.ok).toBe(true);
  });
});
