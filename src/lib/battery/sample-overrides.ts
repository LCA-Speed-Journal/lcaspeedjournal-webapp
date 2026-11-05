import type { SampleRosterMarks } from "./sample-marks";

/** Columns a coach can nudge on the local sample board. DRI edits the 12in box. */
export const SAMPLE_EDIT_KEYS = [
  "10-5_RSI",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "DRI",
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
] as const;

export type SampleEditKey = (typeof SAMPLE_EDIT_KEYS)[number];

type OverrideStore = Map<string, Map<string, number | null>>;

const overrideGlobal = globalThis as typeof globalThis & {
  __lcaSampleOverrides?: OverrideStore;
};

function overrideStore(): OverrideStore {
  if (!overrideGlobal.__lcaSampleOverrides) {
    overrideGlobal.__lcaSampleOverrides = new Map();
  }
  return overrideGlobal.__lcaSampleOverrides;
}

function slotKey(athleteId: string, metric: string): string {
  return `${athleteId}:${metric}`;
}

export function isSampleEditKey(key: string): key is SampleEditKey {
  return (SAMPLE_EDIT_KEYS as readonly string[]).includes(key);
}

export function writeSampleOverride(
  batteryId: string,
  athleteId: string,
  metric: string,
  value: number | null | undefined
) {
  let store = overrideStore().get(batteryId);
  if (!store) {
    store = new Map();
    overrideStore().set(batteryId, store);
  }
  const key = slotKey(athleteId, metric);
  if (value === undefined) store.delete(key);
  else store.set(key, value);
}

export function clearSampleOverrides(batteryId: string) {
  overrideStore().delete(batteryId);
}

export function applySampleOverrides(
  batteryId: string,
  pack: SampleRosterMarks
): SampleRosterMarks {
  const store = overrideStore().get(batteryId);
  if (!store || store.size === 0) return pack;

  const marks = pack.marks.map((mark) => ({ ...mark }));
  const dri = new Map(
    [...pack.dri.entries()].map(([athleteId, rows]) => [
      athleteId,
      rows.map((row) => ({ ...row })),
    ])
  );

  for (const [key, value] of store) {
    const split = key.indexOf(":");
    const athleteId = key.slice(0, split);
    const metric = key.slice(split + 1);
    if (metric === "DRI") {
      const rows = (dri.get(athleteId) ?? []).filter((row) => row.box !== "12");
      dri.set(athleteId, value == null ? rows : [...rows, { box: "12", value }]);
      continue;
    }
    const index = marks.findIndex((mark) => mark.athlete_id === athleteId && mark.key === metric);
    if (value == null) {
      if (index >= 0) marks.splice(index, 1);
      continue;
    }
    if (index >= 0) marks[index] = { ...marks[index], value };
    else marks.push({ athlete_id: athleteId, key: metric, value });
  }

  return { ...pack, marks, dri };
}
