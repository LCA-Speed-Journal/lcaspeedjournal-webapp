import { formatFeetInches } from "@/lib/distance-units";
import type { DropoffDirection, DropoffSummary } from "./summarize";

function formatMark(n: number, units?: string): string {
  const unit = (units ?? "").toLowerCase();
  if (unit === "ft" || unit === "feet") return formatFeetInches(n);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function formatDropoffCaption(summary: DropoffSummary, units?: string): string {
  const base = `Best ${formatMark(summary.initial, units)} · Line ${formatMark(summary.dropoffLine, units)} · ${summary.attemptsAboveLine} above`;
  return summary.crossedDropoff ? `${base} · Past the line` : base;
}

export function attemptPastLine(
  value: number,
  line: number,
  direction: DropoffDirection
): boolean {
  return direction === "time" ? value > line : value < line;
}
