/** Day A board order: the 40-yard splits stay together, then the reactivity pair. */
const DAY_A_COLUMN_ORDER = ["20yd_Dash", "40yd_Dash", "MaxVelocity", "10-5_RSI", "DRI"] as const;

export function orderDayColumnKeys(dayKey: string, keys: readonly string[]): string[] {
  if (dayKey !== "A") return [...keys];
  const present = new Set(keys);
  const ordered = DAY_A_COLUMN_ORDER.filter((key) => present.has(key));
  const listed = new Set<string>(DAY_A_COLUMN_ORDER);
  const rest = keys.filter((key) => !listed.has(key));
  return [...ordered, ...rest];
}
