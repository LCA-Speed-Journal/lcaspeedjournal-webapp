import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseQuotaError,
  QUOTA_COOLDOWN_MS,
  QUOTA_MESSAGE,
  assertDatabaseOpen,
  clearReadCacheForTests,
  databaseErrorBody,
  looksLikeQuota,
  rememberRead,
  resetDatabaseQuotaForTests,
  tripDatabaseQuota,
} from "./db-guard";

afterEach(() => {
  resetDatabaseQuotaForTests();
  clearReadCacheForTests();
  vi.useRealTimers();
});

describe("database quota gate", () => {
  it("recognizes Neon's 402 quota message", () => {
    const err = new Error(
      'Server error (HTTP status 402): {"message":"Your account or project has exceeded the quota. Upgrade your plan to increase limits."}'
    );
    expect(looksLikeQuota(err)).toBe(true);
    expect(databaseErrorBody(err)).toEqual({ error: QUOTA_MESSAGE, status: 503 });
  });

  it("rejects new work for five minutes after the quota trips", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T14:00:00Z"));
    tripDatabaseQuota();
    expect(() => assertDatabaseOpen()).toThrow(DatabaseQuotaError);
    vi.setSystemTime(new Date(Date.now() + QUOTA_COOLDOWN_MS));
    expect(() => assertDatabaseOpen()).not.toThrow();
  });
});

describe("rememberRead", () => {
  it("reuses a successful read and does not store a failure", async () => {
    const load = vi.fn().mockResolvedValue(["ok"]);
    await expect(rememberRead("athletes", load)).resolves.toEqual(["ok"]);
    await expect(rememberRead("athletes", load)).resolves.toEqual(["ok"]);
    expect(load).toHaveBeenCalledTimes(1);

    const fail = vi.fn().mockRejectedValue(new Error("down"));
    await expect(rememberRead("sessions", fail)).rejects.toThrow("down");
    await expect(rememberRead("sessions", fail)).rejects.toThrow("down");
    expect(fail).toHaveBeenCalledTimes(2);
  });

  it("shares one load while the first call is still running", async () => {
    let resolve: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        })
    );
    const first = rememberRead("board", load);
    const second = rememberRead("board", load);
    resolve("row");
    await expect(first).resolves.toBe("row");
    await expect(second).resolves.toBe("row");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
