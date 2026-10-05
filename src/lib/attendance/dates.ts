const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AttendanceRangeResult =
  | { ok: true }
  | { ok: false; error: string };

export type AttendanceWeek = {
  start: string;
  end: string;
};

export type ScheduleEdit = {
  session_date: string;
  action: "cancel" | "add";
};

/** Parse a real YYYY-MM-DD at UTC noon. Invalid calendar days return null. */
function parseIsoDate(iso: string): Date | null {
  const t = iso.trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== t) return null;
  return d;
}

function formatIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Monday = 1 through Sunday = 7. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function inclusiveDayCount(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

export function assertAttendanceRange(
  from: string,
  to: string,
): AttendanceRangeResult {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (!fromDate || !toDate) {
    return { ok: false, error: "Invalid date" };
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return { ok: false, error: "from must be on or before to" };
  }
  if (inclusiveDayCount(fromDate, toDate) > 366) {
    return { ok: false, error: "Date range too long" };
  }
  return { ok: true };
}

function mondayOnOrBefore(date: Date): Date {
  return addDays(date, 1 - isoWeekday(date));
}

export function overlappingWeeks(from: string, to: string): AttendanceWeek[] {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return [];

  const weeks: AttendanceWeek[] = [];
  let monday = mondayOnOrBefore(fromDate);
  while (monday.getTime() <= toDate.getTime()) {
    const sunday = addDays(monday, 6);
    weeks.push({ start: formatIso(monday), end: formatIso(sunday) });
    monday = addDays(monday, 7);
  }
  return weeks;
}

export function enumerateDates(from: string, to: string): string[] {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return [];

  const dates: string[] = [];
  for (
    let cursor = fromDate;
    cursor.getTime() <= toDate.getTime();
    cursor = addDays(cursor, 1)
  ) {
    dates.push(formatIso(cursor));
  }
  return dates;
}

export function scheduledDates(input: {
  from: string;
  to: string;
  weekdays: number[];
  edits: ScheduleEdit[];
}): string[] {
  const weekdays = new Set(input.weekdays);
  const dates = new Set<string>();

  const fromDate = parseIsoDate(input.from);
  const toDate = parseIsoDate(input.to);
  if (!fromDate || !toDate) return [];

  for (const iso of enumerateDates(input.from, input.to)) {
    const parsed = parseIsoDate(iso);
    if (parsed && weekdays.has(isoWeekday(parsed))) {
      dates.add(iso);
    }
  }

  for (const edit of input.edits) {
    const editDate = parseIsoDate(edit.session_date);
    if (!editDate) continue;
    if (
      editDate.getTime() < fromDate.getTime() ||
      editDate.getTime() > toDate.getTime()
    ) {
      continue;
    }
    const iso = formatIso(editDate);
    if (edit.action === "cancel") {
      dates.delete(iso);
    } else {
      dates.add(iso);
    }
  }

  return [...dates].sort();
}
