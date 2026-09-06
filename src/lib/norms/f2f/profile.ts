import { FORTY_YD_DASH, TWENTY_YD_DASH } from "../editor-metrics";
import { mphFromYardSplit } from "../forty-yd";
import { DEFICIENCY_BAND, STANDING_BROAD } from "./constants";
import { isForceStandIn } from "./force-stand-in";
import { reconstructFiveFifteen } from "./reconstruct-515";
import { resolveExplosion, resolveForce, resolveForm } from "./resolve-mark";
import {
  estimateTwentyThirty,
  predict40FromTenTwenty,
  predict40FromTwenty,
} from "./segment-table";
import { canonicalSprintComponent } from "./sprint-component";
import type {
  F2fAthlete,
  F2fEntry,
  F2fProfile,
  F2fQuality,
  F2fVertex,
} from "./types";

const FORM_EXACT: { component: string; yards: number }[] = [
  { component: "20-40yd", yards: 20 },
  { component: "30-40yd", yards: 10 },
  { component: "20-30yd", yards: 10 },
];

function isSprintMetric(metricKey: string): boolean {
  return metricKey === FORTY_YD_DASH || metricKey === TWENTY_YD_DASH;
}

function finiteEntries(
  entries: F2fEntry[],
  pred: (entry: F2fEntry) => boolean
): F2fEntry[] {
  return entries.filter(
    (entry) => pred(entry) && Number.isFinite(entry.display_value)
  );
}

function pickBestTime(entries: F2fEntry[]): F2fEntry | null {
  let best: F2fEntry | null = null;
  for (const entry of entries) {
    if (!best || entry.display_value < best.display_value) best = entry;
  }
  return best;
}

function pickBestJump(entries: F2fEntry[]): F2fEntry | null {
  let best: F2fEntry | null = null;
  for (const entry of entries) {
    if (!best || entry.display_value > best.display_value) best = entry;
  }
  return best;
}

function vertexFromHit(
  hit: { predicted_40: number; extrapolated: boolean } | null,
  projected: boolean,
  mph?: number | null
): F2fVertex | null {
  if (!hit || !Number.isFinite(hit.predicted_40)) return null;
  return {
    predicted_40: hit.predicted_40,
    extrapolated: hit.extrapolated,
    projected,
    ...(mph != null && Number.isFinite(mph) ? { mph } : {}),
  };
}

function vertexFromEntry(
  entry: F2fEntry,
  hit: { predicted_40: number; extrapolated: boolean } | null,
  projected: boolean,
  mph?: number | null
): F2fVertex | null {
  const vertex = vertexFromHit(hit, projected, mph);
  if (!vertex) return null;
  return {
    ...vertex,
    input: {
      metric_key: entry.metric_key,
      component:
        entry.metric_key === STANDING_BROAD
          ? entry.component
          : (canonicalSprintComponent(entry.component) ?? entry.component),
      value: entry.display_value,
      units: entry.metric_key === STANDING_BROAD ? "ft" : "s",
    },
    ...(entry.session_date ? { session_date: entry.session_date } : {}),
  };
}

function pickExplosion(entries: F2fEntry[]): F2fVertex | null {
  const best = pickBestJump(
    finiteEntries(entries, (entry) => entry.metric_key === STANDING_BROAD)
  );
  return best ? vertexFromEntry(best, resolveExplosion(best.display_value), false) : null;
}

function pickSprintSplit(entries: F2fEntry[], component: string): F2fEntry | null {
  const want = canonicalSprintComponent(component);
  return pickBestTime(
    finiteEntries(
      entries,
      (entry) =>
        isSprintMetric(entry.metric_key) &&
        canonicalSprintComponent(entry.component) === want
    )
  );
}

function flyFromCumulatives(
  end: F2fEntry,
  start: F2fEntry,
  flyComponent: string
): F2fEntry | null {
  const value = end.display_value - start.display_value;
  if (!Number.isFinite(value) || value <= 0) return null;
  const sameDate =
    start.session_date && start.session_date === end.session_date
      ? start.session_date
      : undefined;
  return {
    metric_key: end.metric_key,
    component: flyComponent,
    display_value: value,
    ...(sameDate ? { session_date: sameDate } : {}),
  };
}

function withDerivedSprintFlies(entries: F2fEntry[]): F2fEntry[] {
  const extra: F2fEntry[] = [];
  if (!pickSprintSplit(entries, "5-10yd")) {
    const ten = pickSprintSplit(entries, "0-10yd");
    const five = pickSprintSplit(entries, "0-5yd");
    const derived = ten && five ? flyFromCumulatives(ten, five, "5-10yd") : null;
    if (derived) extra.push(derived);
  }
  if (!pickSprintSplit(entries, "10-20yd")) {
    const twenty = pickSprintSplit(entries, "0-20yd");
    const ten = pickSprintSplit(entries, "0-10yd");
    let derived =
      twenty && ten ? flyFromCumulatives(twenty, ten, "10-20yd") : null;
    if (!derived && twenty) {
      const five = pickSprintSplit(entries, "0-5yd");
      const fiveTen = pickSprintSplit([...entries, ...extra], "5-10yd");
      if (five && fiveTen) {
        const value =
          twenty.display_value - five.display_value - fiveTen.display_value;
        if (Number.isFinite(value) && value > 0) {
          derived = {
            metric_key: twenty.metric_key,
            component: "10-20yd",
            display_value: value,
            ...(twenty.session_date ? { session_date: twenty.session_date } : {}),
          };
        }
      }
    }
    if (derived) extra.push(derived);
  }
  return extra.length > 0 ? [...entries, ...extra] : entries;
}

function pickForce(entries: F2fEntry[]): F2fVertex | null {
  const timed515 = pickSprintSplit(entries, "5-15yd");
  if (timed515) {
    return vertexFromEntry(
      timed515,
      resolveForce({
        timeS: timed515.display_value,
        yards: 10,
        lookup: "time",
      }),
      false,
      mphFromYardSplit(timed515.display_value, 10)
    );
  }

  const fiveTen = pickSprintSplit(entries, "5-10yd");
  const tenTwenty = pickSprintSplit(entries, "10-20yd");
  if (fiveTen && tenTwenty) {
    const reconstructed = reconstructFiveFifteen(
      fiveTen.display_value,
      tenTwenty.display_value
    );
    if (reconstructed) {
      const vertex = vertexFromHit(
        resolveForce({
          timeS: reconstructed.timeS,
          yards: 10,
          lookup: "time",
        }),
        true,
        reconstructed.mph
      );
      if (vertex) {
        const sameDate =
          fiveTen.session_date &&
          fiveTen.session_date === tenTwenty.session_date
            ? fiveTen.session_date
            : undefined;
        return {
          ...vertex,
          input: {
            metric_key: fiveTen.metric_key,
            component: "5-15yd",
            value: reconstructed.timeS,
            units: "s",
          },
          ...(sameDate ? { session_date: sameDate } : {}),
        };
      }
    }
  }

  if (fiveTen) {
    return vertexFromEntry(
      fiveTen,
      resolveForce({ timeS: fiveTen.display_value, yards: 5 }),
      false,
      mphFromYardSplit(fiveTen.display_value, 5)
    );
  }

  const standIn = pickBestTime(finiteEntries(entries, isForceStandIn));
  if (!standIn) return null;
  return vertexFromEntry(
    standIn,
    resolveForce({ timeS: standIn.display_value, yards: 20 }),
    false,
    mphFromYardSplit(standIn.display_value, 20)
  );
}

function pickForm(entries: F2fEntry[]): F2fVertex | null {
  let bestExact: F2fVertex | null = null;
  for (const { component, yards } of FORM_EXACT) {
    const want = canonicalSprintComponent(component);
    const matches = finiteEntries(
      entries,
      (entry) =>
        isSprintMetric(entry.metric_key) &&
        canonicalSprintComponent(entry.component) === want
    );
    const best = pickBestTime(matches);
    if (!best) continue;
    const vertex = vertexFromEntry(
      best,
      resolveForm({
        component,
        timeS: best.display_value,
        yards,
      }),
      false
    );
    if (
      vertex &&
      (!bestExact || vertex.predicted_40 < bestExact.predicted_40)
    ) {
      bestExact = vertex;
    }
  }
  if (bestExact) return bestExact;

  const proxy = pickSprintSplit(entries, "10-20yd");
  if (!proxy) return null;
  const t2030 = estimateTwentyThirty(proxy.display_value);
  if (t2030 == null) return null;
  const vertex = vertexFromHit(
    resolveForm({
      component: "20-30yd",
      timeS: t2030,
      yards: 10,
    }),
    true,
    mphFromYardSplit(t2030, 10)
  );
  if (!vertex) return null;
  return {
    ...vertex,
    input: {
      metric_key: proxy.metric_key,
      component: "20-30yd",
      value: t2030,
      units: "s",
    },
    ...(proxy.session_date ? { session_date: proxy.session_date } : {}),
  };
}

function pickActual40(entries: F2fEntry[]): number | null {
  const best = pickBestTime(
    finiteEntries(
      entries,
      (entry) =>
        entry.metric_key === FORTY_YD_DASH &&
        canonicalSprintComponent(entry.component) === "0-40yd"
    )
  );
  return best ? best.display_value : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function classify(
  vertices: { quality: F2fQuality; predicted_40: number }[],
  reference40: number
): { flags: F2fQuality[]; primary: F2fQuality | "balanced" } {
  const flagged: { quality: F2fQuality; gap: number }[] = [];
  for (const vertex of vertices) {
    const gap = (vertex.predicted_40 - reference40) / reference40;
    if (gap > DEFICIENCY_BAND) flagged.push({ quality: vertex.quality, gap });
  }
  if (flagged.length === 0) return { flags: [], primary: "balanced" };

  let worst = flagged[0];
  for (const item of flagged) {
    if (item.gap > worst.gap) worst = item;
  }
  return { flags: flagged.map((item) => item.quality), primary: worst.quality };
}

function projectedForm(reference40: number): F2fVertex {
  return {
    predicted_40: reference40,
    extrapolated: false,
    projected: true,
  };
}

export function buildF2fProfile(
  entries: F2fEntry[],
  athlete: F2fAthlete
): F2fProfile {
  const sprintEntries = withDerivedSprintFlies(entries);
  const explosion = pickExplosion(entries);
  const force = pickForce(sprintEntries);
  let form = pickForm(sprintEntries);

  const actual40 = pickActual40(entries);
  const twenty = pickSprintSplit(sprintEntries, "0-20yd");
  const tenTwenty = pickSprintSplit(sprintEntries, "10-20yd");
  const fromTwenty = twenty ? predict40FromTwenty(twenty.display_value) : null;
  const fromTenTwenty = tenTwenty
    ? predict40FromTenTwenty(tenTwenty.display_value)
    : null;
  const sprintPredicted = [force, form]
    .filter((vertex): vertex is F2fVertex => vertex != null)
    .map((vertex) => vertex.predicted_40);

  let reference_40: number | null = null;
  let reference_source: F2fProfile["reference_source"] = null;

  if (actual40 != null) {
    reference_40 = actual40;
    reference_source = "actual_40";
  } else if (fromTwenty != null) {
    reference_40 = fromTwenty;
    reference_source = "projected";
  } else if (fromTenTwenty != null) {
    reference_40 = fromTenTwenty;
    reference_source = "projected";
  } else if (sprintPredicted.length > 0) {
    reference_40 = median(sprintPredicted);
    reference_source = "projected";
  }

  if (!form && force && reference_40 != null && Number.isFinite(reference_40)) {
    form = projectedForm(reference_40);
  }

  const qualities: { quality: F2fQuality; predicted_40: number }[] = [];
  if (explosion) qualities.push({ quality: "explosion", predicted_40: explosion.predicted_40 });
  if (force) qualities.push({ quality: "force", predicted_40: force.predicted_40 });
  if (form) qualities.push({ quality: "form", predicted_40: form.predicted_40 });

  const show_predicted_40s = athlete.gender === "M";
  const knownGender = athlete.gender === "M" || athlete.gender === "F";
  if (
    !knownGender ||
    qualities.length < 2 ||
    reference_40 == null ||
    !Number.isFinite(reference_40)
  ) {
    return {
      reference_40,
      reference_source,
      explosion,
      force,
      form,
      eligible_for_labels: false,
      show_predicted_40s,
      flags: [],
      primary: null,
    };
  }

  const { flags, primary } = classify(qualities, reference_40);
  return {
    reference_40,
    reference_source,
    explosion,
    force,
    form,
    eligible_for_labels: true,
    show_predicted_40s,
    flags,
    primary,
  };
}
