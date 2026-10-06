import { HUGO_GROUP_META, isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";
import { athleteHasHugoGroup, type HugoTeamAthlete } from "@/lib/weight-room/hugo-memberships";

export function parseContextHugoGroup(
  value: unknown
): { ok: true; value: HugoGroup | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (isHugoGroup(value)) return { ok: true, value };
  return { ok: false, error: "Invalid context_hugo_group" };
}

export function guestFields(
  contextHugoGroup: string | null | undefined,
  membershipGroups: string[]
): { guest: boolean; home_sport_label: string | null } {
  if (!isHugoGroup(contextHugoGroup)) {
    return { guest: false, home_sport_label: null };
  }
  if (membershipGroups.includes(contextHugoGroup)) {
    return { guest: false, home_sport_label: null };
  }
  const labels = membershipGroups
    .filter((group): group is HugoGroup => isHugoGroup(group))
    .map((group) => HUGO_GROUP_META[group].label);
  return {
    guest: true,
    home_sport_label: labels.length > 0 ? labels.join(", ") : null,
  };
}

export function otherSportMatches<
  T extends HugoTeamAthlete & { first_name: string; last_name: string }
>(athletes: T[], sport: string, query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!sport || !q) return [];
  return athletes.filter((athlete) => {
    if (athleteHasHugoGroup(athlete, sport)) return false;
    const name = `${athlete.first_name} ${athlete.last_name}`.toLowerCase();
    return name.includes(q);
  });
}

export function loggedGuests<T extends { id: string }>(
  roster: { id: string }[],
  loggedAthleteIds: string[],
  directory: T[]
): T[] {
  const onRoster = new Set(roster.map((athlete) => athlete.id));
  const byId = new Map(directory.map((athlete) => [athlete.id, athlete]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of loggedAthleteIds) {
    if (onRoster.has(id) || seen.has(id)) continue;
    const athlete = byId.get(id);
    if (!athlete) continue;
    seen.add(id);
    out.push(athlete);
  }
  return out;
}

export function searchGuests<
  T extends HugoTeamAthlete & { id: string; first_name: string; last_name: string }
>(
  athletes: T[],
  hugoGroup: string,
  excludeIds: Set<string>,
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return athletes.filter((athlete) => {
    if (excludeIds.has(athlete.id)) return false;
    if (athleteHasHugoGroup(athlete, hugoGroup)) return false;
    const name = `${athlete.first_name} ${athlete.last_name}`.toLowerCase();
    return name.includes(q);
  });
}

export function idsOnRoster(roster: { id: string }[]): Set<string> {
  return new Set(roster.map((athlete) => athlete.id));
}

export function filterReportSourceToMembers<
  T extends {
    logs: { id: string; athlete_id: string }[];
    results: { session_log_id: string }[];
    athletes: { id: string }[];
  }
>(source: T, memberIds: Set<string>): T {
  const logs = source.logs.filter((log) => memberIds.has(log.athlete_id));
  const logIds = new Set(logs.map((log) => log.id));
  return {
    ...source,
    logs,
    results: source.results.filter((row) => logIds.has(row.session_log_id)),
    athletes: source.athletes.filter((athlete) => memberIds.has(athlete.id)),
  };
}

export function contextHugoGroupForSave(sport: string): HugoGroup | null {
  return isHugoGroup(sport) ? sport : null;
}

export function shouldClearAthleteOnSportChange(
  athlete: HugoTeamAthlete,
  nextSport: string
): boolean {
  if (!nextSport) return false;
  return !athleteHasHugoGroup(athlete, nextSport);
}
