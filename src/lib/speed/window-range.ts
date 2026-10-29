const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type WindowDateRangeOk = { ok: true; from: string; to: string };
export type WindowDateRangeErr = { ok: false; status: 400; error: string };
export type WindowDateRangeResult = WindowDateRangeOk | WindowDateRangeErr;

function parseIsoDateOnly(s: string): Date | null {
  if (!ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

/**
 * Validates historical window menu dates. Unlike reporting ranges, there is no month cap.
 */
export function parseWindowDateRange(params: {
  from: string | null | undefined;
  to: string | null | undefined;
}): WindowDateRangeResult {
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
  return { ok: true, from: fromTrim, to: toTrim };
}
