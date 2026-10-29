"use client";

import { overallAttemptsFor, type DropoffEntry } from "@/lib/dropoff/attempts";
import { formatDropoffCaption } from "@/lib/dropoff/format";
import { directionFromUnits, summarizeDropoff } from "@/lib/dropoff/summarize";
import {
  expandSpeedRun,
  isShortPracticeWindow,
  type DistanceUnit,
  type SpeedRunInput,
  type SpeedRunRow,
} from "@/lib/speed/windows";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent";

export type SpeedRunDraft = {
  distanceUnit: DistanceUnit;
  untimedBuild: string;
  gatesText: string;
  timesText: string;
};

export const EMPTY_SPEED_RUN_DRAFT: SpeedRunDraft = {
  distanceUnit: "m",
  untimedBuild: "0",
  gatesText: "",
  timesText: "",
};

type Preset = {
  label: string;
  unit: DistanceUnit | "current";
  build: string;
  gates: string;
};

const PRESETS: Preset[] = [
  { label: "10m accel", unit: "m", build: "0", gates: "10" },
  { label: "20m accel", unit: "m", build: "0", gates: "10, 20" },
  { label: "30m accel", unit: "m", build: "0", gates: "10, 20, 30" },
  { label: "5–15 fly", unit: "current", build: "5", gates: "15" },
  { label: "10–20 fly", unit: "current", build: "10", gates: "20" },
  { label: "20–40 fly", unit: "current", build: "20", gates: "40" },
  { label: "20yd", unit: "yd", build: "0", gates: "5, 10, 20" },
  { label: "40yd", unit: "yd", build: "0", gates: "10, 20, 40" },
  { label: "50m", unit: "m", build: "0", gates: "30, 40, 50" },
];

function splitList(text: string, separator: "," | "|"): string[] {
  return text
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function speedRunPayload(draft: SpeedRunDraft): SpeedRunInput {
  return {
    distanceUnit: draft.distanceUnit,
    untimedBuild: draft.untimedBuild.trim(),
    gates: splitList(draft.gatesText, ","),
    cumulativeTimes: splitList(draft.timesText, "|"),
  };
}

export function previewSpeedRun(
  draft: SpeedRunDraft
):
  | { ok: true; rows: SpeedRunRow[]; payload: SpeedRunInput }
  | { ok: false; error: string } {
  const payload = speedRunPayload(draft);
  try {
    return { ok: true, rows: expandSpeedRun(payload), payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid speed run";
    return { ok: false, error: message };
  }
}

function shortWindowCaptions(
  rows: SpeedRunRow[],
  entries: DropoffEntry[],
  athleteId: string
): { id: string; caption: string }[] {
  if (!athleteId) return [];
  const captions: { id: string; caption: string }[] = [];
  for (const row of rows) {
    if (!isShortPracticeWindow(row)) continue;
    const picked = overallAttemptsFor(entries, athleteId, row.metric_key, {
      distance_unit: row.distance_unit,
      start_distance: row.start_distance,
      end_distance: row.end_distance,
    });
    if (!picked) continue;
    const summary = summarizeDropoff(picked.values, directionFromUnits(picked.units));
    if (!summary) continue;
    captions.push({
      id: `${row.distance_unit}:${row.start_distance}-${row.end_distance}`,
      caption: `${row.component}: ${formatDropoffCaption(summary)}`,
    });
  }
  return captions;
}

type SpeedRunFieldsProps = {
  draft: SpeedRunDraft;
  onChange: (draft: SpeedRunDraft) => void;
  entries: DropoffEntry[];
  athleteId: string;
};

export function SpeedRunFields({ draft, onChange, entries, athleteId }: SpeedRunFieldsProps) {
  const preview = previewSpeedRun(draft);
  const coachEnteredMark = draft.gatesText.trim() !== "" || draft.timesText.trim() !== "";
  const gateCount = splitList(draft.gatesText, ",").length;
  const timesPlaceholder =
    gateCount > 0
      ? `${gateCount} cumulative ${gateCount === 1 ? "time" : "times"}, pipe-separated (s)`
      : "One cumulative time per gate, pipe-separated (s)";
  const captions = preview.ok ? shortWindowCaptions(preview.rows, entries, athleteId) : [];

  function applyPreset(preset: Preset) {
    onChange({
      ...draft,
      distanceUnit: preset.unit === "current" ? draft.distanceUnit : preset.unit,
      untimedBuild: preset.build,
      gatesText: preset.gates,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-medium text-foreground">Preset</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="min-h-[44px] rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground hover:bg-surface"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-foreground">Unit</legend>
        <div className="flex gap-1 rounded border border-border bg-surface-elevated p-1">
          {(["m", "yd"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={draft.distanceUnit === unit}
              onClick={() => onChange({ ...draft, distanceUnit: unit })}
              className={`min-h-[44px] flex-1 rounded px-3 py-2 text-base ${
                draft.distanceUnit === unit
                  ? "bg-accent text-background"
                  : "text-foreground hover:bg-surface"
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="speed_build" className="mb-1 block text-sm font-medium text-foreground">
          Untimed build
        </label>
        <input
          id="speed_build"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft.untimedBuild}
          onChange={(e) => onChange({ ...draft, untimedBuild: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="speed_gates" className="mb-1 block text-sm font-medium text-foreground">
          Gates
        </label>
        <input
          id="speed_gates"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft.gatesText}
          onChange={(e) => onChange({ ...draft, gatesText: e.target.value })}
          placeholder="Distances from the true start, comma-separated"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="speed_times" className="mb-1 block text-sm font-medium text-foreground">
          Cumulative times
        </label>
        <input
          id="speed_times"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft.timesText}
          onChange={(e) => onChange({ ...draft, timesText: e.target.value })}
          placeholder={timesPlaceholder}
          className={INPUT_CLASS}
        />
      </div>

      {preview.ok && captions.length > 0 ? (
        <ul className="space-y-1" role="status">
          {captions.map((item) => (
            <li key={item.id} className="font-mono text-xs tabular-nums text-foreground-muted">
              {item.caption}
            </li>
          ))}
        </ul>
      ) : null}
      {!preview.ok && coachEnteredMark ? (
        <p className="text-sm text-danger" role="alert">
          {preview.error}
        </p>
      ) : null}
    </div>
  );
}
