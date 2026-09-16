import { schoolYearEnd } from "../../quick-athlete";
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "../editor-metrics";
import { STANDING_BROAD } from "./constants";
import { isForceStandIn } from "./force-stand-in";
import { reconstructFiveFifteen } from "./reconstruct-515";
import { resolveForce, resolveForm } from "./resolve-mark";
import type { F2fEntry } from "./types";

export type DatedF2fEntry = F2fEntry & {
  session_id: string;
  session_date: string;
  created_at?: string;
};

export type F2fPickMode = "full-test" | "best" | "latest" | "earliest";

export type F2fPickedMarks = {
  mode: F2fPickMode;
  composed: boolean;
  as_of: string | null;
  entries: DatedF2fEntry[];
};

const FORM_EXACT: { component: string; yards: number }[] = [
  { component: "20-40yd", yards: 20 },
  { component: "30-40yd", yards: 10 },
  { component: "20-30yd", yards: 10 },
];

export function f2fSchoolYearWindow(now: Date): { from: string; to: string } {
  const endYear = schoolYearEnd(now);
  return {
    from: `${endYear - 1}-08-01`,
    to: `${endYear}-07-31`,
  };
}

function inWindow(
  entry: DatedF2fEntry,
  from?: string,
  to?: string
): boolean {
  if (from && entry.session_date < from) return false;
  if (to && entry.session_date > to) return false;
  return true;
}

function isSprintMetric(metricKey: string): boolean {
  return metricKey === FORTY_YD_DASH || metricKey === TWENTY_YD_DASH;
}

function isFiniteEntry(entry: DatedF2fEntry): boolean {
  return Number.isFinite(entry.display_value);
}

function isF2fRelevant(entry: DatedF2fEntry): boolean {
  if (!isFiniteEntry(entry)) return false;
  return entry.metric_key === STANDING_BROAD || isSprintMetric(entry.metric_key);
}

function pickBestTime(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  let best: DatedF2fEntry | null = null;
  for (const entry of entries) {
    if (!best || entry.display_value < best.display_value) best = entry;
  }
  return best;
}

function pickBestJump(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  let best: DatedF2fEntry | null = null;
  for (const entry of entries) {
    if (!best || entry.display_value > best.display_value) best = entry;
  }
  return best;
}

function finiteWhere(
  entries: DatedF2fEntry[],
  pred: (entry: DatedF2fEntry) => boolean
): DatedF2fEntry[] {
  return entries.filter((entry) => pred(entry) && isFiniteEntry(entry));
}

function pickExplosion(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  return pickBestJump(
    finiteWhere(entries, (entry) => entry.metric_key === STANDING_BROAD)
  );
}

function sprintSplits(
  entries: DatedF2fEntry[],
  component: string
): DatedF2fEntry[] {
  return finiteWhere(
    entries,
    (entry) => isSprintMetric(entry.metric_key) && entry.component === component
  );
}

function sessionHasForce(entries: DatedF2fEntry[]): boolean {
  return forceCandidatesFromPool(entries).length > 0;
}

type ForceCandidate = {
  entries: DatedF2fEntry[];
  predicted_40: number;
  /** Lower is preferred on ties: timed 5-15, reconstructed, solo 5-10, stand-in */
  rank: number;
};

function forcePredicted40(
  kind: "515" | "reconstructed" | "510" | "standin",
  timeS: number
): number | null {
  const hit =
    kind === "515" || kind === "reconstructed"
      ? resolveForce({ timeS, yards: 10, lookup: "time" })
      : kind === "510"
        ? resolveForce({ timeS, yards: 5 })
        : resolveForce({ timeS, yards: 20 });
  if (!hit || !Number.isFinite(hit.predicted_40)) return null;
  return hit.predicted_40;
}

/**
 * Build interchangeable Force candidates from a pool (session or full window).
 * Timed 5-15 and profiled 5-10 (via reconstruction) compete on predicted_40.
 * Solo 5-10 / stand-in only appear when no preferred Force path exists.
 */
function forceCandidatesFromPool(entries: DatedF2fEntry[]): ForceCandidate[] {
  const out: ForceCandidate[] = [];

  const timed515 = pickBestTime(sprintSplits(entries, "5-15yd"));
  if (timed515) {
    const predicted_40 = forcePredicted40("515", timed515.display_value);
    if (predicted_40 != null) {
      out.push({ entries: [timed515], predicted_40, rank: 0 });
    }
  }

  const fiveTen = pickBestTime(sprintSplits(entries, "5-10yd"));
  const tenTwenty = pickBestTime(sprintSplits(entries, "10-20yd"));
  if (fiveTen && tenTwenty) {
    const reconstructed = reconstructFiveFifteen(
      fiveTen.display_value,
      tenTwenty.display_value
    );
    if (reconstructed) {
      const predicted_40 = forcePredicted40(
        "reconstructed",
        reconstructed.timeS
      );
      if (predicted_40 != null) {
        out.push({
          entries: [fiveTen, tenTwenty],
          predicted_40,
          rank: 1,
        });
      }
    }
  }

  // Preferred Force present — do not fall through to solo 5-10 / stand-in.
  if (out.length > 0) return out;

  if (fiveTen) {
    const predicted_40 = forcePredicted40("510", fiveTen.display_value);
    if (predicted_40 != null) {
      out.push({ entries: [fiveTen], predicted_40, rank: 2 });
    }
  }
  if (out.length > 0) return out;

  const standIn = pickBestTime(finiteWhere(entries, isForceStandIn));
  if (standIn) {
    const predicted_40 = forcePredicted40("standin", standIn.display_value);
    if (predicted_40 != null) {
      out.push({ entries: [standIn], predicted_40, rank: 3 });
    }
  }

  return out;
}

/** Prefer lower predicted_40; on ties prefer timed 5-15 over profiled 5-10. */
function pickBestForceByFormula(entries: DatedF2fEntry[]): DatedF2fEntry[] {
  const candidates = forceCandidatesFromPool(entries);
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => {
    if (a.predicted_40 !== b.predicted_40) {
      return a.predicted_40 - b.predicted_40;
    }
    return a.rank - b.rank;
  });
  return candidates[0]!.entries;
}

/**
 * Keep 0-5 / 0-10 / 0-20 / 0-40 from the Force session(s) so composed picks
 * still get Testing Day–style reference scale (esp. 20yd batteries).
 */
const FORCE_SCALE_COMPONENTS = ["0-5yd", "0-10yd", "0-20yd", "0-40yd"] as const;

function pickForceScaleAnchors(
  allEntries: DatedF2fEntry[],
  forceEntries: DatedF2fEntry[]
): DatedF2fEntry[] {
  if (forceEntries.length === 0) return [];
  const sessionIds = new Set(forceEntries.map((entry) => entry.session_id));
  const out: DatedF2fEntry[] = [];
  for (const sessionId of sessionIds) {
    const session = allEntries.filter(
      (entry) => entry.session_id === sessionId && isFiniteEntry(entry)
    );
    for (const component of FORCE_SCALE_COMPONENTS) {
      const hit = pickBestTime(sprintSplits(session, component));
      if (hit) out.push(hit);
    }
  }
  return out;
}

function withForceScaleAnchors(
  allEntries: DatedF2fEntry[],
  forceEntries: DatedF2fEntry[]
): DatedF2fEntry[] {
  if (forceEntries.length === 0) return [];
  return [...forceEntries, ...pickForceScaleAnchors(allEntries, forceEntries)];
}

/**
 * earliest: earliest Force session, then formula among types in that session
 *   (preserves an early 5-10 when Force was only measured that way yet).
 * latest: latest Force session, then formula among types in that session
 *   (5-15 preferred unless profiled 5-10 scores better).
 * best: formula across the whole window (best times per type, then compare).
 */
function pickForceBundle(
  entries: DatedF2fEntry[],
  mode: "best" | "latest" | "earliest"
): DatedF2fEntry[] {
  if (mode === "best") {
    return withForceScaleAnchors(entries, pickBestForceByFormula(entries));
  }

  const bySession = new Map<string, DatedF2fEntry[]>();
  for (const entry of entries) {
    if (!isFiniteEntry(entry)) continue;
    const list = bySession.get(entry.session_id) ?? [];
    list.push(entry);
    bySession.set(entry.session_id, list);
  }

  type Cap = { session_id: string; session_date: string; entries: DatedF2fEntry[] };
  const capable: Cap[] = [];
  for (const [session_id, list] of bySession) {
    if (!sessionHasForce(list)) continue;
    capable.push({
      session_id,
      session_date: list[0]!.session_date,
      entries: list,
    });
  }
  if (capable.length === 0) return [];

  capable.sort((a, b) => {
    if (a.session_date !== b.session_date) {
      return a.session_date.localeCompare(b.session_date);
    }
    return a.session_id.localeCompare(b.session_id);
  });

  const chosen =
    mode === "earliest" ? capable[0]! : capable[capable.length - 1]!;
  const force = pickBestForceByFormula(chosen.entries);
  // Anchors from the chosen session pool (same day as Force), not the whole window.
  return withForceScaleAnchors(chosen.entries, force);
}

function pickForm(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  let bestExact: DatedF2fEntry | null = null;
  let bestPredicted = Infinity;
  for (const { component, yards } of FORM_EXACT) {
    const best = pickBestTime(
      finiteWhere(
        entries,
        (entry) =>
          isSprintMetric(entry.metric_key) && entry.component === component
      )
    );
    if (!best) continue;
    const hit = resolveForm({
      component,
      timeS: best.display_value,
      yards,
    });
    if (hit && hit.predicted_40 < bestPredicted) {
      bestPredicted = hit.predicted_40;
      bestExact = best;
    }
  }
  if (bestExact) return bestExact;

  return pickBestTime(
    finiteWhere(
      entries,
      (entry) =>
        isSprintMetric(entry.metric_key) && entry.component === "10-20yd"
    )
  );
}

function pickActual40(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  return pickBestTime(
    finiteWhere(
      entries,
      (entry) =>
        entry.metric_key === FORTY_YD_DASH && entry.component === "0-40yd"
    )
  );
}

function isExplosionMark(entry: DatedF2fEntry): boolean {
  return entry.metric_key === STANDING_BROAD;
}

function isForceMark(entry: DatedF2fEntry): boolean {
  if (!isSprintMetric(entry.metric_key)) return false;
  if (entry.component === "5-15yd" || entry.component === "5-10yd") return true;
  return isForceStandIn(entry);
}

function isFormMark(entry: DatedF2fEntry): boolean {
  if (!isSprintMetric(entry.metric_key)) return false;
  return (
    entry.component === "20-40yd" ||
    entry.component === "30-40yd" ||
    entry.component === "20-30yd" ||
    entry.component === "10-20yd"
  );
}

function isActual40Mark(entry: DatedF2fEntry): boolean {
  return entry.metric_key === FORTY_YD_DASH && entry.component === "0-40yd";
}

function compareLatest(a: DatedF2fEntry, b: DatedF2fEntry): number {
  if (a.session_date !== b.session_date) {
    return a.session_date < b.session_date ? -1 : 1;
  }
  const aCreated = a.created_at ?? "";
  const bCreated = b.created_at ?? "";
  if (aCreated !== bCreated) {
    return aCreated < bCreated ? -1 : 1;
  }
  if (a.session_id === b.session_id) return 0;
  return a.session_id < b.session_id ? -1 : 1;
}

function pickLatest(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  let latest: DatedF2fEntry | null = null;
  for (const entry of entries) {
    if (!isFiniteEntry(entry)) continue;
    if (!latest || compareLatest(latest, entry) < 0) latest = entry;
  }
  return latest;
}

function pickEarliest(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  let earliest: DatedF2fEntry | null = null;
  for (const entry of entries) {
    if (!isFiniteEntry(entry)) continue;
    if (!earliest || compareLatest(entry, earliest) < 0) earliest = entry;
  }
  return earliest;
}

function compactPicked(
  entries: Array<DatedF2fEntry | null>
): DatedF2fEntry[] {
  const seen = new Set<DatedF2fEntry>();
  const out: DatedF2fEntry[] = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

function sessionBucketCount(entries: DatedF2fEntry[]): number {
  const buckets = new Set<string>();
  for (const entry of entries) {
    if (!isFiniteEntry(entry)) continue;
    if (isExplosionMark(entry)) buckets.add("explosion");
    if (isForceMark(entry)) buckets.add("force");
    if (isFormMark(entry)) buckets.add("form");
    if (isActual40Mark(entry)) buckets.add("actual40");
  }
  return buckets.size;
}

type SessionRecency = {
  session_id: string;
  session_date: string;
  latestCreated: string;
  bucketCount: number;
};

function isNewerSession(a: SessionRecency, b: SessionRecency): boolean {
  if (a.session_date !== b.session_date) return a.session_date > b.session_date;
  if (a.latestCreated !== b.latestCreated) return a.latestCreated > b.latestCreated;
  return a.session_id > b.session_id;
}

function latestSession(pool: SessionRecency[]): SessionRecency | null {
  let best: SessionRecency | null = null;
  for (const session of pool) {
    if (!best || isNewerSession(session, best)) best = session;
  }
  return best;
}

function lastTestingSession(
  entries: DatedF2fEntry[]
): { session_id: string; session_date: string } | null {
  const bySession = new Map<string, DatedF2fEntry[]>();
  for (const entry of entries) {
    if (!isF2fRelevant(entry)) continue;
    const list = bySession.get(entry.session_id);
    if (list) list.push(entry);
    else bySession.set(entry.session_id, [entry]);
  }

  const sessions: SessionRecency[] = [];
  for (const [session_id, list] of bySession) {
    let session_date = list[0].session_date;
    let latestCreated = "";
    for (const entry of list) {
      if (entry.session_date > session_date) session_date = entry.session_date;
      const created = entry.created_at ?? "";
      if (created > latestCreated) latestCreated = created;
    }
    sessions.push({
      session_id,
      session_date,
      latestCreated,
      bucketCount: sessionBucketCount(list),
    });
  }

  const multi = sessions.filter((session) => session.bucketCount >= 2);
  const best = latestSession(multi.length > 0 ? multi : sessions);
  return best
    ? { session_id: best.session_id, session_date: best.session_date }
    : null;
}

function marksAreComposed(entries: DatedF2fEntry[]): boolean {
  const dates = new Set(entries.map((entry) => entry.session_date));
  return dates.size > 1;
}

export function pickF2fMarks(
  entries: DatedF2fEntry[],
  options: { mode: F2fPickMode; from?: string; to?: string }
): F2fPickedMarks {
  const windowed = entries.filter((entry) =>
    inWindow(entry, options.from, options.to)
  );
  const last = lastTestingSession(windowed);
  const as_of = last?.session_date ?? null;

  if (options.mode === "earliest") {
    return pickEarliestF2fMarks(windowed, {});
  }

  if (options.mode === "full-test") {
    return {
      mode: options.mode,
      composed: false,
      as_of,
      entries: last
        ? windowed.filter((entry) => entry.session_id === last.session_id)
        : [],
    };
  }

  if (options.mode === "best") {
    const picked = compactPicked([
      pickExplosion(windowed),
      ...pickForceBundle(windowed, "best"),
      pickForm(windowed),
      pickActual40(windowed),
    ]);
    return {
      mode: options.mode,
      composed: marksAreComposed(picked),
      as_of,
      entries: picked,
    };
  }

  const picked = compactPicked([
    pickLatest(windowed.filter(isExplosionMark)),
    ...pickForceBundle(windowed, "latest"),
    pickLatest(windowed.filter(isFormMark)),
    pickLatest(windowed.filter(isActual40Mark)),
  ]);
  return {
    mode: options.mode,
    composed: marksAreComposed(picked),
    as_of,
    entries: picked,
  };
}

/**
 * Compose earliest mark per F2F quality in the window (Team Progress beginning).
 * Mirrors `latest` mode with inverted recency.
 */
export function pickEarliestF2fMarks(
  entries: DatedF2fEntry[],
  options: { from?: string; to?: string } = {}
): F2fPickedMarks {
  const windowed = entries.filter((entry) =>
    inWindow(entry, options.from, options.to)
  );
  const picked = compactPicked([
    pickEarliest(windowed.filter(isExplosionMark)),
    ...pickForceBundle(windowed, "earliest"),
    pickEarliest(windowed.filter(isFormMark)),
    pickEarliest(windowed.filter(isActual40Mark)),
  ]);
  const as_of =
    picked.length === 0
      ? null
      : picked.reduce(
          (min, e) => (e.session_date < min ? e.session_date : min),
          picked[0]!.session_date
        );
  return {
    mode: "earliest",
    composed: marksAreComposed(picked),
    as_of,
    entries: picked,
  };
}
