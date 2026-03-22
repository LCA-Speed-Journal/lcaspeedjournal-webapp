import { MAX_REPORTING_RANGE_MONTHS } from "./reporting-constants";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ReportingDateRangeOk = { ok: true; from: string; to: string };
export type ReportingDateRangeErr = { ok: false; status: 400; error: string };
export type ReportingDateRangeResult = ReportingDateRangeOk | ReportingDateRangeErr;

function parseIsoDateOnly(s: string): Date | null {
  const t = s.trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const roundTrip = d.toISOString().slice(0, 10);
  if (roundTrip !== t) return null;
  return d;
}

function addUtcMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/**
 * Validates `from` / `to` as calendar dates (YYYY-MM-DD), from ≤ to, and span ≤ MAX_REPORTING_RANGE_MONTHS.
 */
export function parseReportingDateRange(params: {
  from: string | null | undefined;
  to: string | null | undefined;
}): ReportingDateRangeResult {
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
  const maxTo = addUtcMonths(fromD, MAX_REPORTING_RANGE_MONTHS);
  if (toD.getTime() > maxTo.getTime()) {
    return {
      ok: false,
      status: 400,
      error: `Date range too long: maximum ${MAX_REPORTING_RANGE_MONTHS} months`,
    };
  }
  return { ok: true, from: fromTrim, to: toTrim };
}
