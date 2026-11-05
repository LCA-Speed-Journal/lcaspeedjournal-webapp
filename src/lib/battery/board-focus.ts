export type BoardView = "today" | "day" | "meet";

/** Which day a board is ranking. Meet ranks the whole battery, so it has no focus day. */
export function boardFocusDay<T extends { day_key: string; closed_at: unknown }>(
  days: readonly T[],
  view: BoardView,
  dayKey?: string
): T | null {
  if (view === "meet") return null;
  if (view === "day") return days.find((day) => day.day_key === dayKey) ?? null;
  return days.find((day) => day.closed_at == null) ?? days[days.length - 1] ?? null;
}
