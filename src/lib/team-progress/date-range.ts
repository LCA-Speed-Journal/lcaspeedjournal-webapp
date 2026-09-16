import { MAX_TEAM_PROGRESS_RANGE_MONTHS } from "./date-presets";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type TeamProgressRangeOk = { ok: true; from: string; to: string };
export type TeamProgressRangeErr = { ok: false; status: 400; error: string };
export type TeamProgressRangeResult = TeamProgressRangeOk | TeamProgressRangeErr;

function parseIsoDateOnly(s: string): Date | null {
  const t = s.trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== t) return null;
  return d;
}

function addUtcMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** Validates from/to and enforces the 12-month team-progress cap. */
export function parseTeamProgressDateRange(params: {
  from: string | null | undefined;
  to: string | null | undefined;
}): TeamProgressRangeResult {
  const fromTrim = (params.from ?? "").trim();
  const toTrim = (params.to ?? "").trim();
  if (!fromTrim || !toTrim) {
    return {
      ok: false,
      status: 400,
      error: "Missing required query params: from, to (YYYY-MM-DD)",
    };
  }
  const fromD = parseIsoDateOnly(fromTrim);
  const toD = parseIsoDateOnly(toTrim);
  if (!fromD || !toD) {
    return {
      ok: false,
      status: 400,
      error: "Invalid date: from and to must be YYYY-MM-DD",
    };
  }
  if (fromD.getTime() > toD.getTime()) {
    return {
      ok: false,
      status: 400,
      error: "Invalid range: from must be on or before to",
    };
  }
  const maxTo = addUtcMonths(fromD, MAX_TEAM_PROGRESS_RANGE_MONTHS);
  if (toD.getTime() > maxTo.getTime()) {
    return {
      ok: false,
      status: 400,
      error: `Date range too long: maximum ${MAX_TEAM_PROGRESS_RANGE_MONTHS} months`,
    };
  }
  return { ok: true, from: fromTrim, to: toTrim };
}
