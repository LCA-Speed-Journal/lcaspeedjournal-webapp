import type { DropoffDirection, DropoffSummary } from "./summarize";

function formatMark(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function formatDropoffCaption(summary: DropoffSummary): string {
  const base = `Best ${formatMark(summary.initial)} · Line ${formatMark(summary.dropoffLine)} · ${summary.attemptsAboveLine} above`;
  return summary.crossedDropoff ? `${base} · Past the line` : base;
}

export function attemptPastLine(
  value: number,
  line: number,
  direction: DropoffDirection
): boolean {
  return direction === "time" ? value > line : value < line;
}
