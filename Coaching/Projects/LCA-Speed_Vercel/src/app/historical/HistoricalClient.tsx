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

type MetricOption = { key: string; display_name: string; display_units: string };
type SessionItem = { id: string; session_date: string; phase?: string };
type AthleteOption = { id: string; first_name: string; last_name: string };

export default function HistoricalClient() {
  const [from, setFrom] = useState(() => defaultFrom());
  const [to, setTo] = useState(() => defaultTo());
  const [phase, setPhase] = useState("");
  const [metric, setMetric] = useState("");
  const [groupByGender, setGroupByGender] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [progressionMetric, setProgressionMetric] = useState("");
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
    athleteId && progressionMetric
      ? `/api/progression?athlete_id=${encodeURIComponent(athleteId)}&metric=${encodeURIComponent(progressionMetric)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : null;
  const { data: progressionData } = useSWR<{
    data: { points: ProgressionPoint[]; metric_display_name: string; units: string };
  }>(progressionUrl, fetcher);

  const rows = historicalData?.data?.rows ?? [];
  const male = historicalData?.data?.male ?? [];
  const female = historicalData?.data?.female ?? [];
  const units = historicalData?.data?.units ?? "";
  const showGrouped = groupByGender && (male.length > 0 || female.length > 0);
  const progressionPoints = progressionData?.data?.points ?? [];
  const progressionUnits = progressionData?.data?.units ?? "";
  const progressionMetricName = progressionData?.data?.metric_display_name ?? progressionMetric;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-8">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}
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
          </div>
        )}
          </section>
        </div>

        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Progression
          </p>
          <p className="mb-4 text-sm text-foreground-muted">
          Best value per session for one athlete and metric (uses the same date range above).
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">Athlete</span>
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
            >
              <option value="">Select athlete</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.first_name} {a.last_name}
                </option>
              ))}
            </select>
          </label>
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
        </div>
        {athleteId && progressionMetric && (
          <ProgressionChart
            points={progressionPoints}
            metricDisplayName={progressionMetricName}
            units={progressionUnits}
          />
        )}
        {(!athleteId || !progressionMetric) && (
          <p className="text-sm text-foreground-muted">
            Select an athlete and metric to see progression.
          </p>
        )}
        </div>
      </div>
    </div>
  );
}
