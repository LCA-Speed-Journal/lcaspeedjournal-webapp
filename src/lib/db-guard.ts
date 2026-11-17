/** How long a Neon 402 keeps us from opening another connection. */
export const QUOTA_COOLDOWN_MS = 5 * 60 * 1000;

/** Public reads reuse one result for this long. */
export const READ_CACHE_MS = 10_000;

export const QUOTA_MESSAGE = "Database quota reached";

export class DatabaseQuotaError extends Error {
  readonly status = 503;

  constructor() {
    super(QUOTA_MESSAGE);
    this.name = "DatabaseQuotaError";
  }
}

let quotaOpenUntil = 0;

export function looksLikeQuota(err: unknown): boolean {
  if (err instanceof DatabaseQuotaError) return true;
  const record = err as { message?: unknown; sourceError?: { message?: unknown } };
  const message = `${String(record?.message ?? "")} ${String(record?.sourceError?.message ?? "")}`;
  const lower = message.toLowerCase();
  return (
    message.includes("402") ||
    lower.includes("exceeded the quota") ||
    lower.includes("quota exceeded")
  );
}

export function assertDatabaseOpen(now = Date.now()): void {
  if (now < quotaOpenUntil) throw new DatabaseQuotaError();
}

export function tripDatabaseQuota(now = Date.now()): void {
  quotaOpenUntil = now + QUOTA_COOLDOWN_MS;
}

export function resetDatabaseQuotaForTests(): void {
  quotaOpenUntil = 0;
}

/** Turn a quota failure into the response the public pages already display. */
export function databaseErrorBody(err: unknown): { error: string; status: 503 } | null {
  if (!(err instanceof DatabaseQuotaError) && !looksLikeQuota(err)) return null;
  if (!(err instanceof DatabaseQuotaError)) tripDatabaseQuota();
  return { error: QUOTA_MESSAGE, status: 503 };
}

type CacheEntry = { expires: number; value: unknown };

const reads = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export function clearReadCacheForTests(): void {
  reads.clear();
  inflight.clear();
}

/** Share one successful read across callers until the entry expires. Failures are not stored. */
export function rememberRead<T>(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = reads.get(key);
  if (hit && hit.expires > now) return Promise.resolve(hit.value as T);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      reads.set(key, { expires: Date.now() + READ_CACHE_MS, value });
      if (reads.size > 200) {
        const oldest = reads.keys().next().value;
        if (oldest) reads.delete(oldest);
      }
      inflight.delete(key);
      return value;
    })
    .catch((err: unknown) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, promise);
  return promise;
}
