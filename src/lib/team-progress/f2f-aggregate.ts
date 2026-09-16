import { buildF2fProfile } from "@/lib/norms/f2f/profile";
import {
  pickEarliestF2fMarks,
  pickF2fMarks,
  type DatedF2fEntry,
} from "@/lib/norms/f2f/pick-marks";
import type { F2fProfile, F2fQuality } from "@/lib/norms/f2f/types";

export type F2fEndMode = "latest" | "best";

export type F2fAthleteRow = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
};

export type F2fEntryWithAthlete = DatedF2fEntry & { athlete_id: string };

export type AthleteF2fChange = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  /** Max session_date among beginning composed marks */
  first_session_date: string;
  /** Max session_date among end composed marks */
  last_session_date: string;
  /** Beginning = earliest mark per quality (composed). */
  first_profile: F2fProfile;
  /** End = latest or best per quality (composed, with carry-forward). */
  last_profile: F2fProfile;
  end_mode: F2fEndMode;
};

const QUALITIES: F2fQuality[] = ["explosion", "force", "form"];

function maxSessionDate(entries: DatedF2fEntry[]): string | null {
  if (entries.length === 0) return null;
  let max = entries[0]!.session_date;
  for (const e of entries) {
    if (e.session_date > max) max = e.session_date;
  }
  return max;
}

function qualityRetested(
  beginning: F2fProfile,
  end: F2fProfile,
  quality: F2fQuality
): boolean {
  const a = beginning[quality];
  const b = end[quality];
  if (!a || !b) return false;
  if (
    a.session_date != null &&
    b.session_date != null &&
    a.session_date !== b.session_date
  ) {
    return true;
  }
  if (a.predicted_40 !== b.predicted_40) return true;
  if (a.input?.value !== b.input?.value) return true;
  if (a.input?.component !== b.input?.component) return true;
  return false;
}

/** True when ≥1 of Force / Form / Explosion has a second distinct mark. */
export function hasRetestedQuality(
  beginning: F2fProfile,
  end: F2fProfile
): boolean {
  return QUALITIES.some((q) => qualityRetested(beginning, end, q));
}

/**
 * Per-athlete beginning (earliest per quality) vs end (latest or best per quality).
 * Athletes appear when at least one quality was retested; other axes carry forward.
 */
export function aggregateAthleteF2f(opts: {
  athletes: F2fAthleteRow[];
  entries: F2fEntryWithAthlete[];
  endMode?: F2fEndMode;
}): { athletes: AthleteF2fChange[]; end_mode: F2fEndMode } {
  const endMode: F2fEndMode = opts.endMode ?? "latest";
  const byAthlete = new Map<string, F2fAthleteRow>();
  for (const a of opts.athletes) byAthlete.set(a.id, a);

  const entriesByAthlete = new Map<string, F2fEntryWithAthlete[]>();
  for (const e of opts.entries) {
    const list = entriesByAthlete.get(e.athlete_id) ?? [];
    list.push(e);
    entriesByAthlete.set(e.athlete_id, list);
  }

  const out: AthleteF2fChange[] = [];

  for (const [athleteId, entries] of entriesByAthlete) {
    const athlete = byAthlete.get(athleteId);
    if (!athlete) continue;

    const beginningPick = pickEarliestF2fMarks(entries);
    // Eligibility is always earliest vs latest (did they retest?), independent of
    // whether Best happens to equal the beginning marks.
    const latestPick = pickF2fMarks(entries, { mode: "latest" });
    const endPick =
      endMode === "best"
        ? pickF2fMarks(entries, { mode: "best" })
        : latestPick;
    if (beginningPick.entries.length === 0 || endPick.entries.length === 0) {
      continue;
    }

    const first_profile = buildF2fProfile(beginningPick.entries, {
      gender: athlete.gender,
    });
    const latest_profile = buildF2fProfile(latestPick.entries, {
      gender: athlete.gender,
    });
    if (!hasRetestedQuality(first_profile, latest_profile)) continue;

    const last_profile =
      endMode === "best"
        ? buildF2fProfile(endPick.entries, { gender: athlete.gender })
        : latest_profile;

    const first_session_date =
      maxSessionDate(beginningPick.entries) ?? beginningPick.as_of;
    const last_session_date =
      maxSessionDate(endPick.entries) ?? endPick.as_of;
    if (!first_session_date || !last_session_date) continue;

    out.push({
      id: athlete.id,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      gender: athlete.gender,
      first_session_date,
      last_session_date,
      first_profile,
      last_profile,
      end_mode: endMode,
    });
  }

  out.sort((a, b) => {
    const ln = a.last_name.localeCompare(b.last_name);
    if (ln !== 0) return ln;
    return a.first_name.localeCompare(b.first_name);
  });

  return { athletes: out, end_mode: endMode };
}
