"use client";

import { useState, useTransition, useMemo } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import Link from "next/link";
import { PageBackground } from "@/app/components/PageBackground";
import type { LeaderboardRow } from "@/types";
import type { ProgressionPoint } from "@/types";

const ProgressionChart = dynamic(
  () => import("./ProgressionChart").then((m) => m.default),
  { ssr: false }
);

const HistoricalLeaderboardBar = dynamic(
  () => import("./HistoricalLeaderboardBar").then((m) => m.default),
  { ssr: false }
);

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatDate(d);
}

function defaultTo(): string {
  return formatDate(new Date());
}

function rankClass(rank: number): string {
  if (rank === 1) return "bg-gold/20 text-gold border border-gold/50";
  if (rank === 2) return "bg-silver/20 text-silver border border-silver/50";
  if (rank === 3) return "bg-bronze/20 text-bronze border border-bronze/50";
  return "bg-surface border border-border text-foreground";
}

function formatValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

const MAX_PROGRESSION_ATHLETES = 5;

type MetricOption = { key: string; display_name: string; display_units: string };
type SessionItem = { id: string; session_date: string; phase?: string };
type AthleteOption = { id: string; first_name: string; last_name: string; gender?: string };
type ProgressionSeriesItem = {
  athlete_id: string;
  first_name?: string;
  last_name?: string;
  points: ProgressionPoint[];
};
type ProgressionResponse = {
  data: {
    points?: ProgressionPoint[];
    series?: ProgressionSeriesItem[];
    metric_display_name: string;
    units: string;
    team_avg_male_points?: ProgressionPoint[];
    team_avg_female_points?: ProgressionPoint[];
  };
};

export default function HistoricalClient() {
  const [from, setFrom] = useState(() => defaultFrom());
  const [to, setTo] = useState(() => defaultTo());
  const [phase, setPhase] = useState("");
  const [metric, setMetric] = useState("");
  const [groupByGender, setGroupByGender] = useState(false);
  const [leaderboardView, setLeaderboardView] = useState<"bar" | "cards">("bar");
  const [showLeaderboardTeamAvg, setShowLeaderboardTeamAvg] = useState(false);
  const [athleteIds, setAthleteIds] = useState<string[]>([]);
  const [progressionMetric, setProgressionMetric] = useState("");
  const [showTeamAvg, setShowTeamAvg] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { data: metricsData } = useSWR<{ data: { metrics: MetricOption[] } }>(
    "/api/metrics",
    fetcher
  );
  const metrics = metricsData?.data?.metrics ?? [];

  const { data: sessionsData } = useSWR<{ data: SessionItem[] }>("/api/sessions", fetcher);
  const phases = useMemo(() => {
    const list = sessionsData?.data ?? [];
    const set = new Set<string>();
    list.forEach((s) => {
      if (s.phase) set.add(s.phase);
    });
    return Array.from(set).sort();
  }, [sessionsData?.data]);

  const { data: athletesData } = useSWR<{ data: AthleteOption[] }>("/api/athletes", fetcher);
  const athletes = athletesData?.data ?? [];

  const historicalUrl =
    from && to && metric
      ? `/api/leaderboard/historical?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&metric=${encodeURIComponent(metric)}${phase ? `&phase=${encodeURIComponent(phase)}` : ""}${groupByGender ? "&group_by=gender" : ""}`
      : null;
  const { data: historicalData, error: historicalError, mutate: mutateHistorical } = useSWR<{
    data: {
      rows: LeaderboardRow[];
      male?: LeaderboardRow[];
      female?: LeaderboardRow[];
      metric_display_name: string;
      units: string;
    };
  }>(historicalUrl, fetcher);

  const progressionUrl =
    athleteIds.length > 0 && progressionMetric && from && to
      ? `/api/progression?${athleteIds.map((id) => `athlete_id=${encodeURIComponent(id)}`).join("&")}&metric=${encodeURIComponent(progressionMetric)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${showTeamAvg ? "&team_avg=1" : ""}`
      : null;
  const { data: progressionData } = useSWR<ProgressionResponse>(progressionUrl, fetcher);

  const rows = historicalData?.data?.rows ?? [];
  const male = historicalData?.data?.male ?? [];
  const female = historicalData?.data?.female ?? [];
  const units = historicalData?.data?.units ?? "";
  const showGrouped = groupByGender && (male.length > 0 || female.length > 0);

  const leaderboardMaleAvg =
    male.length > 0 ? male.reduce((s, r) => s + r.display_value, 0) / male.length : null;
  const leaderboardFemaleAvg =
    female.length > 0 ? female.reduce((s, r) => s + r.display_value, 0) / female.length : null;

  const progressionSeries = useMemo(() => {
    const d = progressionData?.data;
    if (!d) return [];
    if (d.series && d.series.length > 0) return d.series;
    if (d.points && athleteIds.length > 0) {
      const id = athleteIds[0];
      const athlete = athletes.find((a) => a.id === id);
      return [
        {
          athlete_id: id,
          first_name: athlete?.first_name ?? "",
          last_name: athlete?.last_name ?? "",
          points: d.points,
        },
      ];
    }
    return [];
  }, [progressionData?.data, athleteIds, athletes]);

  const progressionUnits = progressionData?.data?.units ?? "";
  const progressionMetricName = progressionData?.data?.metric_display_name ?? progressionMetric;
  const teamAvgMalePointsRaw = progressionData?.data?.team_avg_male_points ?? [];
  const teamAvgFemalePointsRaw = progressionData?.data?.team_avg_female_points ?? [];

  const hasMaleSelected = athleteIds.some((id) => {
    const a = athletes.find((x) => x.id === id);
    const g = (a?.gender ?? "").toLowerCase();
    return g === "m" || g === "male";
  });
  const hasFemaleSelected = athleteIds.some((id) => {
    const a = athletes.find((x) => x.id === id);
    const g = (a?.gender ?? "").toLowerCase();
    return g === "f" || g === "female";
  });
  const teamAvgMalePoints = showTeamAvg && hasMaleSelected ? teamAvgMalePointsRaw : [];
  const teamAvgFemalePoints = showTeamAvg && hasFemaleSelected ? teamAvgFemalePointsRaw : [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-8">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}>
          <header className="mb-8 flex items-center justify-between">
            <div>
              <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Historical & Progression
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Home
            </Link>
          </header>

          <section className="mb-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Historical leaderboard
            </p>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => startTransition(() => setFrom(e.target.value))}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => startTransition(() => setTo(e.target.value))}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">Phase</span>
            <select
              value={phase}
              onChange={(e) => startTransition(() => setPhase(e.target.value))}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
            >
              <option value="">All</option>
              {phases.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">Metric</span>
            <select
              value={metric}
              onChange={(e) => startTransition(() => setMetric(e.target.value))}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
            >
              <option value="">Select metric</option>
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.display_name} ({m.display_units})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={groupByGender}
              onChange={(e) => startTransition(() => setGroupByGender(e.target.checked))}
              className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
            />
            <span className="text-sm text-foreground-muted">Group by gender</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">View:</span>
            <div className="flex rounded-lg border border-border bg-surface-elevated p-0.5">
              <button
                type="button"
                onClick={() => setLeaderboardView("bar")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  leaderboardView === "bar"
                    ? "bg-accent text-background"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                Bar chart
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardView("cards")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  leaderboardView === "cards"
                    ? "bg-accent text-background"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                Cards
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showLeaderboardTeamAvg}
              onChange={(e) => setShowLeaderboardTeamAvg(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
            />
            <span className="text-sm text-foreground-muted">Show team averages</span>
          </label>
        </div>
        {isPending && (
          <p className="mb-2 text-xs text-foreground-muted">Updating…</p>
        )}
        {historicalError && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-danger">Failed to load historical leaderboard.</p>
            <button
              type="button"
              onClick={() => mutateHistorical()}
              className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface"
            >
              Retry
            </button>
          </div>
        )}
        {!historicalError && historicalUrl && rows.length === 0 && !historicalData && (
          <p className="text-sm text-foreground-muted">Loading…</p>
        )}
        {!historicalError && historicalUrl && historicalData && rows.length === 0 && (
          <p className="text-sm text-foreground-muted">No entries in this range.</p>
        )}
        {!historicalError && rows.length > 0 && (
          <div className="space-y-4">
            {leaderboardView === "bar" ? (
              <HistoricalLeaderboardBar
                rows={rows}
                male={male}
                female={female}
                units={units}
                groupByGender={groupByGender}
                metricDisplayName={historicalData?.data?.metric_display_name ?? metric}
                showTeamAvg={showLeaderboardTeamAvg}
                maleAvg={leaderboardMaleAvg}
                femaleAvg={leaderboardFemaleAvg}
              />
            ) : (
              <>
                {showLeaderboardTeamAvg && (leaderboardMaleAvg != null || leaderboardFemaleAvg != null) && (
                  <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/80 bg-surface-elevated px-4 py-2 text-sm text-foreground-muted">
                    {leaderboardMaleAvg != null && (
                      <span>
                        Men&apos;s Average: <span className="font-mono font-medium text-foreground">{formatValue(leaderboardMaleAvg)} {units}</span>
                      </span>
                    )}
                    {leaderboardFemaleAvg != null && (
                      <span>
                        Women&apos;s Average: <span className="font-mono font-medium text-foreground">{formatValue(leaderboardFemaleAvg)} {units}</span>
                      </span>
                    )}
                  </div>
                )}
              {showGrouped ? (
              <>
                {male.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground-muted">Boys</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {male.map((r) => (
                        <div
                          key={r.athlete_id}
                          className={`relative flex flex-col rounded-lg border p-3 ${rankClass(r.rank)}`}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
                        >
                          <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-foreground-muted">
                            #{r.rank}
                          </span>
                          <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
                            {r.first_name} {r.last_name}
                          </span>
                          <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
                            {formatValue(r.display_value)}{" "}
                            <span className="text-sm font-normal text-foreground-muted">
                              {units}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {female.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground-muted">Girls</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {female.map((r) => (
                        <div
                          key={r.athlete_id}
                          className={`relative flex flex-col rounded-lg border p-3 ${rankClass(r.rank)}`}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
                        >
                          <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-foreground-muted">
                            #{r.rank}
                          </span>
                          <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
                            {r.first_name} {r.last_name}
                          </span>
                          <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
                            {formatValue(r.display_value)}{" "}
                            <span className="text-sm font-normal text-foreground-muted">
                              {units}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {rows.map((r) => (
                  <div
                    key={r.athlete_id}
                    className={`relative flex flex-col rounded-lg border p-3 ${rankClass(r.rank)}`}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
                  >
                    <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-foreground-muted">
                      #{r.rank}
                    </span>
                    <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
                      {r.first_name} {r.last_name}
                    </span>
                    <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
                      {formatValue(r.display_value)}{" "}
                      <span className="text-sm font-normal text-foreground-muted">
                        {units}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            </>
            )}
          </div>
        )}
          </section>
        </div>

        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Progression
          </p>
          <p className="mb-4 text-sm text-foreground-muted">
          Best value per session for selected athlete(s) and metric (uses the same date range above). Select up to {MAX_PROGRESSION_ATHLETES} athletes.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">Athletes</span>
            <div className="flex flex-wrap items-center gap-2">
              {athleteIds.map((id) => {
                const a = athletes.find((x) => x.id === id);
                const label = a ? `${a.first_name} ${a.last_name}` : id.slice(0, 8);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => setAthleteIds((prev) => prev.filter((x) => x !== id))}
                      className="rounded p-0.5 text-foreground-muted hover:bg-surface hover:text-foreground"
                      aria-label={`Remove ${label}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {athleteIds.length < MAX_PROGRESSION_ATHLETES && (
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !athleteIds.includes(id)) {
                      setAthleteIds((prev) => [...prev, id].slice(0, MAX_PROGRESSION_ATHLETES));
                    }
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground-muted focus:border-accent focus:text-foreground"
                >
                  <option value="">Add athlete…</option>
                  {athletes
                    .filter((a) => !athleteIds.includes(a.id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.first_name} {a.last_name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">Metric</span>
            <select
              value={progressionMetric}
              onChange={(e) => setProgressionMetric(e.target.value)}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
            >
              <option value="">Select metric</option>
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.display_name} ({m.display_units})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showTeamAvg}
              onChange={(e) => setShowTeamAvg(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
            />
            <span className="text-sm text-foreground-muted">Show team averages</span>
          </label>
        </div>
        {athleteIds.length > 0 && progressionMetric && (
          <ProgressionChart
            series={progressionSeries}
            metricDisplayName={progressionMetricName}
            units={progressionUnits}
            teamAvgMalePoints={teamAvgMalePoints}
            teamAvgFemalePoints={teamAvgFemalePoints}
          />
        )}
        {(!athleteIds.length || !progressionMetric) && (
          <p className="text-sm text-foreground-muted">
            Select athlete(s) and metric to see progression.
          </p>
        )}
        </div>
      </div>
    </div>
  );
}
