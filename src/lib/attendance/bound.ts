import type { HugoGroup } from "@/lib/weight-room/constants";

/**
 * Bound school schedule: https://www.gobound.com/mn/schools/lclassical
 *
 * Contest cards are `div.comp-entry` blocks. The heading is the sport and
 * level (`FOOTBALL` / `Varsity`, or `VOLLEYBALL, GIRLS` / `Junior Varsity`).
 * The date is a weekday header such as "Friday, Oct 9". The live page often
 * leaves the year off; we fill it in from that weekday. A checked-in fixture
 * is a short redacted card list, not a copy of the page.
 */
const BOUND_SCHOOL_URL = "https://www.gobound.com/mn/schools/lclassical";
const BOUND_TIMEOUT_MS = 10_000;

const WEEKDAY_UTC: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const NAMED_DATE =
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i;

export class BoundScheduleError extends Error {
  constructor(message = "Bound did not return a schedule") {
    super(message);
    this.name = "BoundScheduleError";
  }
}

export type BoundContest = {
  hugo_group: HugoGroup;
  contest_date: string;
  bound_key: string;
  label: string;
};

export type UnmatchedBoundContest = {
  contest_date: string;
  label: string;
};

export type BoundSchedule = {
  contests: BoundContest[];
  unmatched: UnmatchedBoundContest[];
};

export async function fetchBoundScheduleHtml(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOUND_TIMEOUT_MS);
  try {
    const response = await fetch(BOUND_SCHOOL_URL, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; LCASpeedJournal/1.0)",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error("Bound request failed");
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseBoundContests(html: string): BoundContest[] {
  return parseBoundSchedule(html).contests;
}

export function parseBoundSchedule(html: string, now = new Date()): BoundSchedule {
  const contests: BoundContest[] = [];
  const unmatched: UnmatchedBoundContest[] = [];
  const seenKeys = new Set<string>();
  const seenUnmatched = new Set<string>();

  for (const entry of entryChunks(html)) {
    const label = headingText(entry);
    const contestDate = contestDateFromEntry(entry, now);
    if (!label || !contestDate) continue;
    if (isSkippedLevel(label) || !/\bvarsity\b/i.test(label)) continue;

    const hugoGroup = mapVarsityGroup(label);
    if (!hugoGroup) {
      const unmatchedKey = `${contestDate}:${label}`;
      if (seenUnmatched.has(unmatchedKey)) continue;
      seenUnmatched.add(unmatchedKey);
      unmatched.push({ contest_date: contestDate, label });
      continue;
    }

    const boundKey = `${hugoGroup}:${contestDate}`;
    if (seenKeys.has(boundKey)) continue;
    seenKeys.add(boundKey);
    contests.push({
      hugo_group: hugoGroup,
      contest_date: contestDate,
      bound_key: boundKey,
      label,
    });
  }

  return { contests, unmatched };
}

function entryChunks(html: string): string[] {
  const re = /<div\b[^>]*\bclass="[^"]*\bcomp-entry\b[^"]*"[^>]*>/gi;
  const starts: number[] = [];
  for (const match of html.matchAll(re)) {
    if (match.index != null) starts.push(match.index);
  }
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function headingText(entryHtml: string): string {
  const heading = entryHtml.match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i);
  const cancelled = entryHtml.match(/<p\b[^>]*\btext-danger\b[^>]*>([\s\S]*?)<\/p>/i);
  return visibleText(`${heading?.[1] ?? ""} ${cancelled?.[1] ?? ""}`);
}

function contestDateFromEntry(entryHtml: string, now: Date): string | null {
  const header = entryHtml.match(/\bvb-fw-700\b[^>]*>([\s\S]*?)<\/div>/i);
  const fromHeader = dateFromText(visibleText(header?.[1] ?? ""), now);
  if (fromHeader) return fromHeader;
  return dateFromText(visibleText(entryHtml), now);
}

function dateFromText(text: string, now: Date): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const [year, month, day] = iso[1].split("-").map(Number);
    const parsed = isoDate(year, month, day);
    if (parsed) return parsed;
  }

  const named = text.match(NAMED_DATE);
  if (named) {
    const weekday = WEEKDAY_UTC[named[1].toLowerCase()];
    const month = MONTHS[named[2].toLowerCase()];
    const day = Number(named[3]);
    const year = named[4] ? Number(named[4]) : null;
    if (month && weekday != null) {
      if (year != null) return isoDate(year, month, day);
      return inferYear(month, day, weekday, now);
    }
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (!slash) return null;
  const month = Number(slash[1]);
  const day = Number(slash[2]);
  if (slash[3]) return isoDate(Number(slash[3]), month, day);
  return inferYear(month, day, null, now);
}

function inferYear(
  month: number,
  day: number,
  weekday: number | null,
  now: Date,
): string | null {
  const refYear = now.getUTCFullYear();
  let best: { iso: string; distance: number } | null = null;
  for (let year = refYear - 1; year <= refYear + 1; year++) {
    const iso = isoDate(year, month, day);
    if (!iso) continue;
    const stamp = new Date(`${iso}T12:00:00.000Z`);
    if (weekday != null && stamp.getUTCDay() !== weekday) continue;
    const distance = Math.abs(stamp.getTime() - now.getTime());
    if (!best || distance < best.distance) best = { iso, distance };
  }
  return best?.iso ?? null;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const stamp = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    stamp.getUTCFullYear() !== year ||
    stamp.getUTCMonth() !== month - 1 ||
    stamp.getUTCDate() !== day
  ) {
    return null;
  }
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}`;
}

/** Drop non-varsity levels. `MS` is a whole word so "Teams" is not treated as middle school. */
function isSkippedLevel(text: string): boolean {
  if (/cancelled/i.test(text)) return true;
  if (/junior\s+varsity/i.test(text)) return true;
  if (/\bjv\b/i.test(text)) return true;
  if (/c[\s-]*team/i.test(text)) return true;
  if (/\bms\b/i.test(text)) return true;
  if (/\b\d{1,2}(?:st|nd|rd|th)\b/i.test(text)) return true;
  return false;
}

function mapVarsityGroup(text: string): HugoGroup | null {
  const girls = /\b(girls?|women)\b/i.test(text);
  const boys = /\b(boys?|men)\b/i.test(text);

  if (/\b(nordic|ski(?:ing)?)\b/i.test(text)) return "nordic_ski";
  if (/\bcross\s+country\b/i.test(text)) return "xc";
  if (/\bfootball\b/i.test(text)) return "football";
  if (/\bvolleyball\b/i.test(text) && girls) return "volleyball";
  if (/\bsoccer\b/i.test(text) && girls) return "womens_soccer";
  if (/\bsoccer\b/i.test(text) && boys) return "soccer";
  if (/\btennis\b/i.test(text) && girls) return "womens_tennis";
  if (/\bbasketball\b/i.test(text) && girls) return "womens_basketball";
  if (/\bbasketball\b/i.test(text) && boys) return "mens_basketball";
  if (/\btrack\b/i.test(text)) return "track";
  if (/\bbaseball\b/i.test(text)) return "baseball";
  if (/\bgolf\b/i.test(text)) return "golf";
  return null;
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
