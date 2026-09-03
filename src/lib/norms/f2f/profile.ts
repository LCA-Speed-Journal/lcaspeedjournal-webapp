import { FORTY_YD_DASH, TWENTY_YD_DASH } from "../editor-metrics";
import { DEFICIENCY_BAND, STANDING_BROAD } from "./constants";
import { resolveExplosion, resolveForce, resolveForm } from "./resolve-mark";
import type {
  F2fAthlete,
  F2fEntry,
  F2fProfile,
  F2fQuality,
  F2fVertex,
} from "./types";

const FORCE_PREFERRED: { component: string; yards: number }[] = [
  { component: "5-15yd", yards: 10 },
  { component: "5-10yd", yards: 5 },
];

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
  projected: boolean
): F2fVertex | null {
  if (!hit || !Number.isFinite(hit.predicted_40)) return null;
  return {
    predicted_40: hit.predicted_40,
    extrapolated: hit.extrapolated,
    projected,
  };
}

function pickExplosion(entries: F2fEntry[]): F2fVertex | null {
  const best = pickBestJump(
    finiteEntries(entries, (entry) => entry.metric_key === STANDING_BROAD)
  );
  return best ? vertexFromHit(resolveExplosion(best.display_value), false) : null;
}

function pickForce(entries: F2fEntry[]): F2fVertex | null {
  for (const { component, yards } of FORCE_PREFERRED) {
    const best = pickBestTime(
      finiteEntries(
        entries,
        (entry) => isSprintMetric(entry.metric_key) && entry.component === component
      )
    );
    if (best) {
      return vertexFromHit(
        resolveForce({ timeS: best.display_value, yards }),
        false
      );
    }
  }

  const standIn = pickBestTime(
    finiteEntries(
      entries,
      (entry) =>
        entry.metric_key === TWENTY_YD_DASH && entry.component === "0-20yd"
    )
  );
  if (!standIn) return null;
  return vertexFromHit(
    resolveForce({ timeS: standIn.display_value, yards: 20 }),
    false
  );
}

function pickForm(entries: F2fEntry[]): F2fVertex | null {
  let bestExact: F2fVertex | null = null;
  for (const { component, yards } of FORM_EXACT) {
    const matches = finiteEntries(
      entries,
      (entry) => isSprintMetric(entry.metric_key) && entry.component === component
    );
    const best = pickBestTime(matches);
    if (!best) continue;
    const vertex = vertexFromHit(
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

  const proxy = pickBestTime(
    finiteEntries(
      entries,
      (entry) => isSprintMetric(entry.metric_key) && entry.component === "10-20yd"
    )
  );
  if (!proxy) return null;
  return vertexFromHit(
    resolveForm({
      component: "10-20yd",
      timeS: proxy.display_value,
      yards: 10,
    }),
    true
  );
}

function pickActual40(entries: F2fEntry[]): number | null {
  const best = pickBestTime(
    finiteEntries(
      entries,
      (entry) =>
        entry.metric_key === FORTY_YD_DASH && entry.component === "0-40yd"
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

export function buildF2fProfile(
  entries: F2fEntry[],
  athlete: F2fAthlete
): F2fProfile {
  const explosion = pickExplosion(entries);
  const force = pickForce(entries);
  let form = pickForm(entries);

  const actual40 = pickActual40(entries);
  const sprintPredicted = [force, form]
    .filter((vertex): vertex is F2fVertex => vertex != null)
    .map((vertex) => vertex.predicted_40);

  let reference_40: number | null = null;
  let reference_source: F2fProfile["reference_source"] = null;

  if (actual40 != null) {
    reference_40 = actual40;
    reference_source = "actual_40";
  } else if (sprintPredicted.length > 0) {
    reference_40 = median(sprintPredicted);
    reference_source = "projected";
    if (!form && Number.isFinite(reference_40)) {
      form = {
        predicted_40: reference_40,
        extrapolated: false,
        projected: true,
      };
    }
  }

  const qualities: { quality: F2fQuality; predicted_40: number }[] = [];
  if (explosion) qualities.push({ quality: "explosion", predicted_40: explosion.predicted_40 });
  if (force) qualities.push({ quality: "force", predicted_40: force.predicted_40 });
  if (form) qualities.push({ quality: "form", predicted_40: form.predicted_40 });

  const canLabel =
    athlete.gender === "M" &&
    qualities.length >= 2 &&
    reference_40 != null &&
    Number.isFinite(reference_40);

  if (!canLabel) {
    return {
      reference_40,
      reference_source,
      explosion,
      force,
      form,
      eligible_for_labels: false,
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
    flags,
    primary,
  };
}
