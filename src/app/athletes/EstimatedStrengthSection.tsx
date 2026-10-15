"use client";

import dynamic from "next/dynamic";
import useSWR from "swr";

const TeamProgressLineChart = dynamic(
  () =>
    import("../reporting/team-progress/TeamProgressChart").then(
      (m) => m.TeamProgressLineChart
    ),
  { ssr: false }
);

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    const message =
      json && typeof json.error === "string" ? json.error : "Request failed";
    throw new Error(message);
  }
  return json;
};

type StrengthPoint = {
  date: string;
  reference_e1rm: number;
  source_movement: string;
  load: number;
  reps: number;
  rpe: number;
};

type StrengthPatternSeries = {
  pattern: "squat" | "hinge" | "single_leg" | "press" | "pull" | "power";
  reference_name: string;
  points: StrengthPoint[];
};

type StrengthSeriesResponse = {
  data: {
    athletes: Array<{
      athlete_id: string;
      patterns: StrengthPatternSeries[];
    }>;
  };
};

type EstimatedStrengthSectionProps = {
  athleteId: string;
};

function formatChange(first: number, last: number): string {
  const delta = Math.round(last - first);
  if (delta > 0) return `+${delta} lb`;
  return `${delta} lb`;
}

function PatternBlock({ pattern }: { pattern: StrengthPatternSeries }) {
  const first = pattern.points[0];
  const last = pattern.points[pattern.points.length - 1];
  const latestLb = Math.round(last.reference_e1rm);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground">
      <h4 className="font-medium">{pattern.reference_name}</h4>
      <p>
        <span className="text-foreground-muted">Latest: </span>
        {latestLb} lb
      </p>
      <p className="mb-2">
        <span className="text-foreground-muted">Change: </span>
        {formatChange(first.reference_e1rm, last.reference_e1rm)}
      </p>
      <TeamProgressLineChart
        label={pattern.reference_name}
        units="lb"
        points={pattern.points.map((point) => ({
          date: point.date,
          value: point.reference_e1rm,
        }))}
      />
      <p className="mt-2 text-foreground-muted">
        {last.date}, {last.source_movement}, {last.load} lb, {last.reps} reps,
        RPE {last.rpe}
      </p>
    </div>
  );
}

export function EstimatedStrengthSection({
  athleteId,
}: EstimatedStrengthSectionProps) {
  const key = `/api/strength/series?athlete_id=${encodeURIComponent(athleteId)}`;
  const { data, error: loadError, isLoading } = useSWR<StrengthSeriesResponse>(
    key,
    fetcher
  );

  const athlete = data?.data.athletes[0];
  const patterns = (athlete?.patterns ?? []).filter(
    (pattern) => pattern.points.length > 0
  );

  return (
    <section className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
      <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent" />
      <h3 className="mb-4 text-lg font-semibold text-foreground">
        Estimated strength
      </h3>

      {isLoading && !data && (
        <p className="text-sm text-foreground-muted">
          Loading estimated strength…
        </p>
      )}

      {loadError && !data && (
        <p className="text-sm text-danger" role="alert">
          {loadError instanceof Error
            ? loadError.message
            : "Failed to load estimated strength"}
        </p>
      )}

      {data && patterns.length === 0 && (
        <p className="text-sm text-foreground">No estimated maxes yet.</p>
      )}

      {patterns.length > 0 && (
        <div className="space-y-2">
          {patterns.map((pattern) => (
            <PatternBlock key={pattern.pattern} pattern={pattern} />
          ))}
        </div>
      )}
    </section>
  );
}
