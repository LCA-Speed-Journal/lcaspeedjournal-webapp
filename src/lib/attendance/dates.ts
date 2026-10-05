const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

/** Parse YYYY-MM-DD at UTC noon so the calendar day does not shift. */
function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
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
  if (fromDate.getTime() > toDate.getTime()) return [];

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
  if (fromDate.getTime() > toDate.getTime()) return [];

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

  for (const iso of enumerateDates(input.from, input.to)) {
    if (weekdays.has(isoWeekday(parseIsoDate(iso)))) {
      dates.add(iso);
    }
  }

  for (const edit of input.edits) {
    if (edit.session_date < input.from || edit.session_date > input.to) {
      continue;
    }
    if (edit.action === "cancel") {
      dates.delete(edit.session_date);
    } else {
      dates.add(edit.session_date);
    }
  }

  return [...dates].sort();
}
