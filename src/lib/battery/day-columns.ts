/** Day A board order: the 40-yard splits stay together, then the reactivity pair. */
const DAY_A_COLUMN_ORDER = ["20yd_Dash", "40yd_Dash", "MaxVelocity", "10-5_RSI", "DRI"] as const;

export function orderDayColumnKeys(dayKey: string, keys: readonly string[]): string[] {
  if (dayKey !== "A") return [...keys];
  const listed = new Set<string>(DAY_A_COLUMN_ORDER);
  if (keys.some((key) => !listed.has(key))) return [...keys];
  const present = new Set(keys);
  return DAY_A_COLUMN_ORDER.filter((key) => present.has(key));
}
