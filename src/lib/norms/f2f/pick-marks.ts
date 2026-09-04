import { schoolYearEnd } from "../../quick-athlete";
import { FORTY_YD_DASH, TWENTY_YD_DASH } from "../editor-metrics";
import { STANDING_BROAD } from "./constants";
import { resolveForm } from "./resolve-mark";
import type { F2fEntry } from "./types";

export type DatedF2fEntry = F2fEntry & {
  session_id: string;
  session_date: string;
  created_at?: string;
};

export type F2fPickMode = "full-test" | "best" | "latest";

export type F2fPickedMarks = {
  mode: F2fPickMode;
  composed: boolean;
  as_of: string | null;
  entries: DatedF2fEntry[];
};

const FORCE_PREFERRED: { component: string }[] = [
  { component: "5-15yd" },
  { component: "5-10yd" },
];

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

function pickForce(entries: DatedF2fEntry[]): DatedF2fEntry | null {
  for (const { component } of FORCE_PREFERRED) {
    const best = pickBestTime(
      finiteWhere(
        entries,
        (entry) =>
          isSprintMetric(entry.metric_key) && entry.component === component
      )
    );
    if (best) return best;
  }
  return pickBestTime(
    finiteWhere(
      entries,
      (entry) =>
        entry.metric_key === TWENTY_YD_DASH && entry.component === "0-20yd"
    )
  );
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
  return entry.metric_key === TWENTY_YD_DASH && entry.component === "0-20yd";
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

function lastTestingSession(
  entries: DatedF2fEntry[]
): { session_id: string; session_date: string } | null {
  const bySession = new Map<
    string,
    { session_date: string; latestCreated: string }
  >();
  for (const entry of entries) {
    if (!isF2fRelevant(entry)) continue;
    const created = entry.created_at ?? "";
    const prev = bySession.get(entry.session_id);
    if (!prev) {
      bySession.set(entry.session_id, {
        session_date: entry.session_date,
        latestCreated: created,
      });
      continue;
    }
    if (created > prev.latestCreated) prev.latestCreated = created;
  }

  let best: {
    session_id: string;
    session_date: string;
    latestCreated: string;
  } | null = null;
  for (const [session_id, info] of bySession) {
    if (!best) {
      best = { session_id, ...info };
      continue;
    }
    if (info.session_date > best.session_date) {
      best = { session_id, ...info };
      continue;
    }
    if (info.session_date < best.session_date) continue;
    if (
      info.latestCreated > best.latestCreated ||
      (info.latestCreated === best.latestCreated && session_id > best.session_id)
    ) {
      best = { session_id, ...info };
    }
  }
  return best
    ? { session_id: best.session_id, session_date: best.session_date }
    : null;
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
    return {
      mode: options.mode,
      composed: true,
      as_of,
      entries: compactPicked([
        pickExplosion(windowed),
        pickForce(windowed),
        pickForm(windowed),
        pickActual40(windowed),
      ]),
    };
  }

  return {
    mode: options.mode,
    composed: true,
    as_of,
    entries: compactPicked([
      pickLatest(windowed.filter(isExplosionMark)),
      pickLatest(windowed.filter(isForceMark)),
      pickLatest(windowed.filter(isFormMark)),
      pickLatest(windowed.filter(isActual40Mark)),
    ]),
  };
}
