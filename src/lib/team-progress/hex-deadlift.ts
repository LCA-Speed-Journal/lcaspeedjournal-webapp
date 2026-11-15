const HEX_TO_CONVENTIONAL = 1.15;

export function isHexDeadliftName(name: string): boolean {
  const lower = name.toLowerCase();
  return /trap[\s-]?bar/.test(lower) || /\bhex\b/.test(lower);
}

export function projectedConventionalDeadlift(hexLb: number): number {
  return hexLb / HEX_TO_CONVENTIONAL;
}
