/** How often a live testing screen asks for new marks. */
export const LIVE_REFRESH_MS = 15_000;

/** Stop asking after the payload has stayed the same this long. */
export const QUIET_AFTER_MS = 10 * 60 * 1000;

export function stillRefreshing(changedAt: number, now: number): boolean {
  return now - changedAt < QUIET_AFTER_MS;
}
