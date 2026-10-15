"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import useSWR from "swr";
import {
  patternReference,
  type StrengthPattern,
} from "@/lib/strength/exercises";
import type { HugoGroup } from "@/lib/weight-room/constants";

const TeamProgressLineChart = dynamic(
  () => import("./TeamProgressChart").then((m) => m.TeamProgressLineChart),
  { ssr: false }
);

const STRENGTH_PATTERNS: readonly StrengthPattern[] = [
  "squat",
  "hinge",
  "single_leg",
  "press",
  "pull",
  "power",
];

type StrengthPoint = {
  date: string;
  reference_e1rm: number;
  source_movement: string;
  load: number;
  reps: number;
  rpe: number;
};

type AthletePattern = {
  pattern: StrengthPattern;
  reference_name: string;
  points: StrengthPoint[];
};

type MedianPattern = {
  pattern: string;
  points: Array<{ date: string; reference_e1rm: number }>;
};

type StrengthSeriesResponse = {
  data: {
    athletes: Array<{
      athlete_id: string;
      patterns: AthletePattern[];
    }>;
    median: MedianPattern[];
  };
};

type RosterAthlete = {
  id: string;
  first_name: string;
  last_name: string;
};

type EstimatedStrengthBlockProps = {
  hugoGroup: HugoGroup;
  from: string;
  to: string;
  roster: RosterAthlete[];
};

function isStrengthPattern(value: string): value is StrengthPattern {
  return (STRENGTH_PATTERNS as readonly string[]).includes(value);
}

function referenceName(
  pattern: string,
  athletes: StrengthSeriesResponse["data"]["athletes"]
): string | null {
  for (const athlete of athletes) {
    const match = athlete.patterns.find((row) => row.pattern === pattern);
    if (match?.reference_name) return match.reference_name;
  }
  if (!isStrengthPattern(pattern)) return null;
  return patternReference(pattern).name;
}

async function fetcher(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.ok) return res.json() as Promise<StrengthSeriesResponse>;
  let message = res.statusText || `Failed (${res.status})`;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {
    // ignore
  }
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/reporting/team-progress";
  }
  throw new Error(message);
}

export function EstimatedStrengthBlock({
  hugoGroup,
  from,
  to,
  roster,
}: EstimatedStrengthBlockProps) {
  const [athleteId, setAthleteId] = useState("");
  const selectedId = roster.some((athlete) => athlete.id === athleteId)
    ? athleteId
    : "";

  const params = new URLSearchParams({
    hugo_group: hugoGroup,
    from,
    to,
  });
  const { data, error, isLoading } = useSWR(
    `/api/strength/series?${params.toString()}`,
    fetcher
  );

  const athletes = data?.data.athletes ?? [];
  const showingGroup = selectedId === "";
  const cards = showingGroup
    ? (data?.data.median ?? [])
        .filter((pattern) => pattern.points.length > 0)
        .map((pattern) => ({
          key: pattern.pattern,
          name: referenceName(pattern.pattern, athletes),
          caption: "Median",
          label: "Median",
          points: pattern.points.map((point) => ({
            date: point.date,
            value: point.reference_e1rm,
          })),
        }))
    : (
        athletes.find((athlete) => athlete.athlete_id === selectedId)
          ?.patterns ?? []
      )
        .filter((pattern) => pattern.points.length > 0)
        .map((pattern) => ({
          key: pattern.pattern,
          name: pattern.reference_name,
          caption: null,
          label: pattern.reference_name,
          points: pattern.points.map((point) => ({
            date: point.date,
            value: point.reference_e1rm,
          })),
        }));

  const rosterOptions = roster.toSorted((a, b) => {
    const byLast = a.last_name.localeCompare(b.last_name);
    if (byLast !== 0) return byLast;
    return a.first_name.localeCompare(b.first_name);
  });

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Estimated strength
        </h2>
        <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
          <span className="text-foreground-muted">Athlete</span>
          <select
            value={selectedId}
            onChange={(e) => setAthleteId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="">Group median</option>
            {rosterOptions.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.last_name}, {athlete.first_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error instanceof Error ? error.message : "Failed to load"}
        </p>
      ) : isLoading && !data ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No estimated maxes in this window.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-border bg-surface-elevated/40 p-3"
            >
              {card.name ? (
                <p className="mb-1 text-sm font-medium text-foreground">
                  {card.name}
                </p>
              ) : null}
              {card.caption ? (
                <p className="mb-2 text-xs text-foreground-muted">
                  {card.caption}
                </p>
              ) : null}
              <TeamProgressLineChart
                label={card.label}
                units="lb"
                points={card.points}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
