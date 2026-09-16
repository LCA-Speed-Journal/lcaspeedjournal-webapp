import type { HugoSeason } from "@/lib/weight-room/constants";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";

export type DateRange = { from: string; to: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoLocal(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Hugo season window. `seasonYear` is the calendar year of the season's
 * primary stretch (fall/spring of that year; winter ends in that year).
 */
export function hugoSeasonRange(
  season: HugoSeason,
  seasonYear: number
): DateRange {
  switch (season) {
    case "fall":
      return { from: isoLocal(seasonYear, 8, 1), to: isoLocal(seasonYear, 11, 30) };
    case "winter":
      return {
        from: isoLocal(seasonYear - 1, 11, 15),
        to: isoLocal(seasonYear, 3, 15),
      };
    case "spring":
      return { from: isoLocal(seasonYear, 3, 1), to: isoLocal(seasonYear, 6, 15) };
    case "year":
      return {
        from: isoLocal(seasonYear - 1, 8, 1),
        to: isoLocal(seasonYear, 7, 31),
      };
  }
}

/** School year containing `today` (Aug 1 – Jul 31). Uses UTC calendar parts. */
export function schoolYearRange(today: Date = new Date()): DateRange {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  if (m >= 8) {
    return { from: isoLocal(y, 8, 1), to: isoLocal(y + 1, 7, 31) };
  }
  return { from: isoLocal(y - 1, 8, 1), to: isoLocal(y, 7, 31) };
}

/** Inclusive last-N calendar days ending on `today` (UTC date). */
export function lastNDaysRange(today: Date = new Date(), days = 90): DateRange {
  const to = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: ymdUtc(from), to: ymdUtc(to) };
}

/** Default range for a Hugo group: current calendar year's matching season. */
export function defaultRangeForHugoGroup(
  hugoGroup: HugoGroup,
  today: Date = new Date()
): DateRange {
  const season = HUGO_GROUP_META[hugoGroup].season;
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  if (season === "fall") {
    return hugoSeasonRange("fall", m >= 8 ? y : y - 1);
  }
  if (season === "winter") {
    if (m >= 11) return hugoSeasonRange("winter", y + 1);
    if (m <= 3) return hugoSeasonRange("winter", y);
    return hugoSeasonRange("winter", y + 1);
  }
  if (season === "spring") {
    return hugoSeasonRange("spring", y);
  }
  return schoolYearRange(today);
}

/** Max span for team-progress APIs (months). */
export const MAX_TEAM_PROGRESS_RANGE_MONTHS = 12;
