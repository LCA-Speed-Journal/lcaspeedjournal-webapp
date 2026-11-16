"use client";

import { useState } from "react";
import type { BoardRsqPoint } from "@/lib/battery/load";
import { rsqPoint, rsqQuadrant, type RsqQuadrant } from "@/lib/battery/rsq";

const DOT: Record<RsqQuadrant, string> = {
  reactive: "bg-blue-600",
  compliant: "bg-red-600",
  stiff: "bg-green-600",
  developing: "bg-yellow-400",
};

const CORNER_LABELS: { label: string; className: string }[] = [
  { label: "Reactive", className: "left-1 top-1 text-blue-800 [.dark_&]:text-blue-400" },
  { label: "Compliant", className: "right-1 top-1 text-right text-red-800 [.dark_&]:text-red-400" },
  { label: "Stiff", className: "bottom-1 left-1 text-green-800 [.dark_&]:text-green-400" },
  {
    label: "Developing",
    className: "bottom-1 right-1 text-right text-yellow-800 [.dark_&]:text-yellow-400",
  },
];

export type RsqDot = BoardRsqPoint & {
  rsi: number | null;
  rank: number | null;
};

export function RsqPlot({
  athletes,
  variant = "preview",
}: {
  athletes: RsqDot[];
  variant?: "preview" | "full";
}) {
  const full = variant === "full";
  const [hoverId, setHoverId] = useState<string | null>(null);
  return (
    <figure
      data-rsq-plot
      data-rsq-variant={variant}
      aria-label="Jump height versus ground contact"
      className={
        full
          ? "mx-auto flex aspect-square h-full max-h-full max-w-full min-h-0 flex-col text-foreground"
          : "w-72 rounded-md border border-border bg-surface/95 p-2 text-foreground shadow-lg"
      }
    >
      <figcaption
        className={`font-semibold uppercase tracking-[0.16em] text-foreground-muted ${full ? "mb-3 text-sm" : "mb-1 text-[11px]"}`}
      >
        RSQ
      </figcaption>
      <div className={`grid min-h-0 flex-1 ${full ? "grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2" : "grid-cols-[1.75rem_1fr] gap-x-1"}`}>
        <div
          className={`flex flex-col justify-between py-0.5 font-medium leading-none text-foreground-muted ${full ? "text-sm" : "text-[10px]"}`}
        >
          <span>20 in</span>
          <span>10</span>
          <span>0</span>
        </div>
        <div className="flex min-h-0 items-center justify-center">
          <div className={`relative ${full ? "h-full w-full" : "aspect-square w-full"}`}>
            <div className="absolute inset-0 overflow-hidden rounded-sm border border-border">
              <div className="absolute inset-y-0 left-0 w-1/2">
                <div className="absolute inset-x-0 top-0 h-1/2 bg-blue-500/20" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-green-500/20" />
              </div>
              <div className="absolute inset-y-0 right-0 w-1/2">
                <div className="absolute inset-x-0 top-0 h-1/2 bg-red-500/20" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-yellow-400/30" />
              </div>
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-foreground/60" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-foreground/60" />
              {CORNER_LABELS.map((corner) => (
                <span
                  key={corner.label}
                  className={`pointer-events-none absolute font-semibold leading-none ${full ? "text-sm" : "text-[9px]"} ${corner.className}`}
                >
                  {corner.label}
                </span>
              ))}
            </div>
            {athletes.map((athlete) => {
              const point = rsqPoint(athlete.jump_in, athlete.gct_ms);
              const quadrant = rsqQuadrant(athlete.jump_in, athlete.gct_ms);
              const rsi = athlete.rsi == null ? "—" : athlete.rsi.toFixed(2);
              const rank = athlete.rank == null ? "—" : String(athlete.rank);
              const shown = hoverId === athlete.athlete_id;
              return (
                <span
                  key={athlete.athlete_id}
                  data-rsq-athlete={athlete.athlete_id}
                  className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 ${shown ? "z-30" : ""} ${full ? "h-8 w-8" : "h-4 w-4"}`}
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  onMouseEnter={() => setHoverId(athlete.athlete_id)}
                  onMouseLeave={() => setHoverId((current) => (current === athlete.athlete_id ? null : current))}
                >
                  <span
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background ${DOT[quadrant]} ${full ? "h-4 w-4" : "h-2.5 w-2.5"}`}
                  />
                  <span
                    data-rsq-tip
                    className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 flex w-max -translate-x-1/2 flex-col rounded border border-border bg-surface px-2 py-1 text-left normal-case tracking-normal text-foreground shadow-md ${shown ? "visible" : "invisible"}`}
                  >
                    <span className={`font-semibold ${full ? "text-sm" : "text-[11px]"}`}>{athlete.name}</span>
                    <span className={full ? "text-sm" : "text-[11px]"}>RSI {rsi}</span>
                    <span className={full ? "text-sm" : "text-[11px]"}>Rank {rank}</span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className={`grid font-medium leading-none text-foreground-muted ${full ? "mt-2 grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 text-sm" : "mt-1 grid-cols-[1.75rem_1fr] gap-x-1 text-[10px]"}`}
      >
        <span />
        <span className="flex justify-between">
          <span>0 ms</span>
          <span>200</span>
          <span>400</span>
        </span>
      </div>
    </figure>
  );
}
