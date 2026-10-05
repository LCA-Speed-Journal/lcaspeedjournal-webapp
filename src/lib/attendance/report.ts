import {
  enumerateDates,
  overlappingWeeks,
  scheduledDates,
  type AttendanceWeek,
  type ScheduleEdit,
} from "./dates";

export type Enrollment = "liberty" | "homeschool" | "coop";

export type AttendanceMember = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  enrollment: Enrollment | null;
  joined_on: string;
};

export type AttendancePresent = {
  athlete_id: string;
  session_date: string;
};

export type AttendanceGame = {
  contest_date: string;
  dismissed: boolean;
};

export type AttendanceReportInput = {
  hugo_group: string;
  from: string;
  to: string;
  weekdays: number[];
  edits: ScheduleEdit[];
  members: AttendanceMember[];
  present: AttendancePresent[];
  games: AttendanceGame[];
};

export type AttendanceRate = {
  present: number;
  possible: number;
  pct: number | null;
};

export type AttendanceWeekScore = {
  start: string;
  end: string;
  roster_ids: string[];
  headcount: AttendanceRate;
  session_fill: AttendanceRate;
};

export type AttendanceAthleteScore = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  enrollment: Enrollment | null;
  session_rate: AttendanceRate;
  week_rate: AttendanceRate;
};

export type AttendanceDay = {
  date: string;
  count: number;
  game: boolean;
};

export type AttendanceSplit = {
  headcount: AttendanceRate;
  session_fill: AttendanceRate;
};

export type AttendanceReport = {
  hugo_group: string;
  from: string;
  to: string;
  needs_rhythm: boolean;
  scheduled_dates: string[];
  unset_count: number;
  team: AttendanceSplit;
  splits: Record<Enrollment, AttendanceSplit>;
  weeks: AttendanceWeekScore[];
  athletes: AttendanceAthleteScore[];
  days: AttendanceDay[];
};

function ratio(present: number, possible: number): AttendanceRate {
  if (possible === 0) return { present: 0, possible: 0, pct: null };
  return { present, possible, pct: (100 * present) / possible };
}

/** Half-up to one decimal for a non-negative percent. */
function roundHalfUp1(value: number): number {
  return Math.round(value * 10 + 1e-9) / 10;
}

function displayed(rate: AttendanceRate): AttendanceRate {
  if (rate.pct === null) return rate;
  return { ...rate, pct: roundHalfUp1(rate.pct) };
}

/**
 * Season percent is the unweighted mean of weekly percents.
 * Weeks with a null percent (no roster, or no scheduled dates) are left out.
 * present and possible are sums of the weeks that contributed a percent.
 */
function aggregateRates(rates: AttendanceRate[]): AttendanceRate {
  const counted = rates.filter((rate) => rate.pct !== null);
  if (counted.length === 0) return { present: 0, possible: 0, pct: null };

  let present = 0;
  let possible = 0;
  let pctSum = 0;
  for (const rate of counted) {
    present += rate.present;
    possible += rate.possible;
    pctSum += rate.pct ?? 0;
  }
  return {
    present,
    possible,
    pct: roundHalfUp1(pctSum / counted.length),
  };
}

function dedupePresent(marks: AttendancePresent[]): Map<string, Set<string>> {
  const byAthlete = new Map<string, Set<string>>();
  const seen = new Set<string>();
  for (const mark of marks) {
    const key = `${mark.athlete_id}|${mark.session_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let dates = byAthlete.get(mark.athlete_id);
    if (!dates) {
      dates = new Set();
      byAthlete.set(mark.athlete_id, dates);
    }
    dates.add(mark.session_date);
  }
  return byAthlete;
}

function datesInWeek(
  dates: readonly string[],
  week: AttendanceWeek,
): string[] {
  return dates.filter((date) => date >= week.start && date <= week.end);
}

function headcount(
  roster: AttendanceMember[],
  window: ReadonlySet<string>,
  presentByAthlete: Map<string, Set<string>>,
): AttendanceRate {
  let present = 0;
  for (const member of roster) {
    const dates = presentByAthlete.get(member.athlete_id);
    if (!dates) continue;
    for (const date of dates) {
      if (window.has(date)) {
        present += 1;
        break;
      }
    }
  }
  return ratio(present, roster.length);
}

function sessionFill(
  roster: AttendanceMember[],
  scheduled: readonly string[],
  presentByAthlete: Map<string, Set<string>>,
): AttendanceRate {
  let present = 0;
  for (const member of roster) {
    const dates = presentByAthlete.get(member.athlete_id);
    if (!dates) continue;
    for (const date of scheduled) {
      if (dates.has(date)) present += 1;
    }
  }
  return ratio(present, roster.length * scheduled.length);
}

function scoreSplit(
  roster: AttendanceMember[],
  scheduled: readonly string[],
  window: ReadonlySet<string>,
  presentByAthlete: Map<string, Set<string>>,
): AttendanceSplit {
  return {
    headcount: headcount(roster, window, presentByAthlete),
    session_fill: sessionFill(roster, scheduled, presentByAthlete),
  };
}

function mondayOf(iso: string): string | null {
  return overlappingWeeks(iso, iso)[0]?.start ?? null;
}

function summarize(weekly: AttendanceSplit[]): AttendanceSplit {
  return {
    headcount: aggregateRates(weekly.map((week) => week.headcount)),
    session_fill: aggregateRates(weekly.map((week) => week.session_fill)),
  };
}

export function buildAttendanceReport(
  input: AttendanceReportInput,
): AttendanceReport {
  const rangeDates = enumerateDates(input.from, input.to);
  const rangeSet = new Set(rangeDates);
  const calendarWeeks = overlappingWeeks(input.from, input.to);
  const scheduled = scheduledDates({
    from: input.from,
    to: input.to,
    weekdays: input.weekdays,
    edits: input.edits,
  });
  const presentByAthlete = dedupePresent(input.present);
  const gameDates = new Set(
    input.games
      .filter((game) => !game.dismissed)
      .map((game) => game.contest_date),
  );

  const weekContexts = calendarWeeks.map((week) => {
    const roster = input.members.filter(
      (member) => member.joined_on <= week.end,
    );
    const windowDates = datesInWeek(rangeDates, week);
    return {
      week,
      roster,
      scheduled: datesInWeek(scheduled, week),
      window: new Set(windowDates),
    };
  });

  const weeks: AttendanceWeekScore[] = weekContexts.map((context) => {
    const team = scoreSplit(
      context.roster,
      context.scheduled,
      context.window,
      presentByAthlete,
    );
    return {
      start: context.week.start,
      end: context.week.end,
      roster_ids: context.roster.map((member) => member.athlete_id),
      headcount: team.headcount,
      session_fill: team.session_fill,
    };
  });

  const team = summarize(weeks);

  function splitFor(enrollment: Enrollment): AttendanceSplit {
    return summarize(
      weekContexts.map((context) =>
        scoreSplit(
          context.roster.filter((member) => member.enrollment === enrollment),
          context.scheduled,
          context.window,
          presentByAthlete,
        ),
      ),
    );
  }

  const splits: Record<Enrollment, AttendanceSplit> = {
    liberty: splitFor("liberty"),
    homeschool: splitFor("homeschool"),
    coop: splitFor("coop"),
  };

  const rosteredIds = new Set(weeks.flatMap((week) => week.roster_ids));
  const unset_count = input.members.filter(
    (member) => member.enrollment === null && rosteredIds.has(member.athlete_id),
  ).length;

  const athletes: AttendanceAthleteScore[] = input.members.map((member) => {
    const dates = presentByAthlete.get(member.athlete_id);
    const monday = mondayOf(member.joined_on);
    const eligibleSessions = monday
      ? scheduled.filter((date) => date >= monday)
      : [];
    let sessionsPresent = 0;
    for (const date of eligibleSessions) {
      if (dates?.has(date)) sessionsPresent += 1;
    }

    const eligibleWeeks = weekContexts.filter(
      (context) => member.joined_on <= context.week.end,
    );
    let weeksPresent = 0;
    for (const context of eligibleWeeks) {
      if (!dates) continue;
      for (const date of dates) {
        if (context.window.has(date)) {
          weeksPresent += 1;
          break;
        }
      }
    }

    return {
      athlete_id: member.athlete_id,
      first_name: member.first_name,
      last_name: member.last_name,
      enrollment: member.enrollment,
      session_rate: displayed(ratio(sessionsPresent, eligibleSessions.length)),
      week_rate: displayed(ratio(weeksPresent, eligibleWeeks.length)),
    };
  });

  const days: AttendanceDay[] = rangeDates.map((date) => {
    const context = weekContexts.find((week) => week.window.has(date));
    let count = 0;
    if (context) {
      for (const member of context.roster) {
        if (presentByAthlete.get(member.athlete_id)?.has(date)) count += 1;
      }
    }
    return {
      date,
      count,
      game: gameDates.has(date),
    };
  });

  const hasAddInRange = input.edits.some(
    (edit) => edit.action === "add" && rangeSet.has(edit.session_date),
  );

  return {
    hugo_group: input.hugo_group,
    from: input.from,
    to: input.to,
    needs_rhythm: input.weekdays.length === 0 && !hasAddInRange,
    scheduled_dates: scheduled,
    unset_count,
    team,
    splits,
    weeks,
    athletes,
    days,
  };
}
