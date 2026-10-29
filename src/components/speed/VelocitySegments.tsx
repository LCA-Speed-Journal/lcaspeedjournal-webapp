"use client";

import { useState } from "react";
import {
  medianSegmentsForFlyLength,
  segmentsForFlyLength,
  type BuildInDistanceRow,
  type DistanceUnit,
  type VelocitySegment,
} from "@/lib/speed/profile";

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { left: 44, right: 16, top: 16, bottom: 32 };

type FlyChoice = {
  unit: DistanceUnit;
  length: number;
  count: number;
};

function choiceKey(choice: FlyChoice): string {
  return `${choice.unit}:${choice.length}`;
}

function flyChoices(rows: BuildInDistanceRow[]): FlyChoice[] {
  const map = new Map<string, FlyChoice>();
  for (const row of rows) {
    if (row.distance_unit !== "m" && row.distance_unit !== "yd") continue;
    const length = Number(row.end_distance) - Number(row.start_distance);
    if (!Number.isFinite(length)) continue;
    const key = `${row.distance_unit}:${length}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { unit: row.distance_unit, length, count: 1 });
  }
  return [...map.values()].sort(
    (a, b) => a.length - b.length || a.unit.localeCompare(b.unit)
  );
}

function defaultFlyChoice(choices: FlyChoice[]): FlyChoice | null {
  const tens = choices.filter((choice) => choice.length === 10);
  if (tens.length === 0) return choices[0] ?? null;
  return tens.reduce((best, choice) => (choice.count > best.count ? choice : best));
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function VelocitySegments({ segments }: { segments: VelocitySegment[] }) {
  if (segments.length === 0) {
    return (
      <svg
        role="img"
        aria-label="Build-in velocity chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-48 w-full"
      />
    );
  }

  const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
  const ys = segments.map((segment) => segment.mph);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = maxX - minX || 1;
  const xPad = xSpan * 0.08;
  const yPad = maxY === minY ? 1 : (maxY - minY) * 0.15;
  const x0 = minX - xPad;
  const x1 = maxX + xPad;
  const y0 = minY - yPad;
  const y1 = maxY + yPad;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * plotH;
  const fastest = maxY;

  return (
    <svg
      role="img"
      aria-label={`Build-in velocity chart, fastest ${formatTick(fastest)} mph`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-56 w-full"
    >
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={HEIGHT - PAD.bottom}
        stroke="var(--color-border)"
      />
      <line
        x1={PAD.left}
        y1={HEIGHT - PAD.bottom}
        x2={WIDTH - PAD.right}
        y2={HEIGHT - PAD.bottom}
        stroke="var(--color-border)"
      />
      <text
        x={PAD.left - 8}
        y={sy(maxY)}
        textAnchor="end"
        dominantBaseline="middle"
        fill="var(--color-foreground-muted)"
        fontSize="12"
      >
        {formatTick(maxY)}
      </text>
      {minY !== maxY ? (
        <text
          x={PAD.left - 8}
          y={sy(minY)}
          textAnchor="end"
          dominantBaseline="middle"
          fill="var(--color-foreground-muted)"
          fontSize="12"
        >
          {formatTick(minY)}
        </text>
      ) : null}
      <text
        x={sx(minX)}
        y={HEIGHT - 8}
        textAnchor="middle"
        fill="var(--color-foreground-muted)"
        fontSize="12"
      >
        {formatTick(minX)}
      </text>
      {minX !== maxX ? (
        <text
          x={sx(maxX)}
          y={HEIGHT - 8}
          textAnchor="middle"
          fill="var(--color-foreground-muted)"
          fontSize="12"
        >
          {formatTick(maxX)}
        </text>
      ) : null}
      {segments.map((segment, index) => {
        const highlighted = segment.mph === fastest;
        return (
          <line
            key={`${segment.x1}-${segment.x2}-${segment.mph}-${index}`}
            x1={sx(segment.x1)}
            x2={sx(segment.x2)}
            y1={sy(segment.mph)}
            y2={sy(segment.mph)}
            stroke={highlighted ? "var(--color-accent)" : "var(--color-foreground-muted)"}
            strokeWidth={highlighted ? 3 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function BuildInVelocityChart({
  rows,
  aggregate,
}: {
  rows: BuildInDistanceRow[];
  aggregate: boolean;
}) {
  const choices = flyChoices(rows);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = choices.find((choice) => choiceKey(choice) === picked) ?? defaultFlyChoice(choices);
  const segments = selected
    ? aggregate
      ? medianSegmentsForFlyLength(rows, selected.unit, selected.length)
      : segmentsForFlyLength(rows, selected.unit, selected.length)
    : [];

  return (
    <div>
      {choices.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {choices.map((choice) => {
            const active = selected != null && choiceKey(choice) === choiceKey(selected);
            return (
              <button
                key={choiceKey(choice)}
                type="button"
                aria-pressed={active}
                onClick={() => setPicked(choiceKey(choice))}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent"
                    : "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent/50"
                }
              >
                {choice.length}
                {choice.unit} fly
              </button>
            );
          })}
        </div>
      ) : null}
      <VelocitySegments segments={segments} />
      {segments.length > 0 ? (
        <p className="mt-2 text-xs text-foreground-muted">
          Distance from the start ({selected?.unit}) · mph. The bright line is the fastest fly.
        </p>
      ) : null}
    </div>
  );
}
