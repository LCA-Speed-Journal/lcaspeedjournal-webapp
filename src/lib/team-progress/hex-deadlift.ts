const HEX_TO_CONVENTIONAL = 1.15;

export function isHexDeadliftName(name: string): boolean {
  const lower = name.toLowerCase();
  const hexOrTrap = /trap[\s-]?bar/.test(lower) || /\bhex\b/.test(lower);
  if (!hexOrTrap) return false;
  return lower.includes("deadlift") || lower.includes("1rm");
}

export function projectedConventionalDeadlift(hexLb: number): number {
  return hexLb / HEX_TO_CONVENTIONAL;
}
