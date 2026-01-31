"use client";

import { useState, useTransition, useMemo } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import Link from "next/link";
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
  if (rank === 1) return "bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-400/50";
  if (rank === 2) return "bg-zinc-300/30 text-zinc-600 dark:text-zinc-400 border-zinc-400/50";
  if (rank === 3) return "bg-amber-700/20 text-amber-800 dark:text-amber-600 border-amber-600/50";
  return "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700";
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
  const { data: historicalData, error: historicalError } = useSWR<{
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
    <div className="min-h-screen p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historical & Progression</h1>
        <Link
          href="/"
          className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Home
        </Link>
      </header>

      <section className="mb-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Historical leaderboard
        </h2>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => startTransition(() => setFrom(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => startTransition(() => setTo(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Phase</span>
            <select
              value={phase}
              onChange={(e) => startTransition(() => setPhase(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Metric</span>
            <select
              value={metric}
              onChange={(e) => startTransition(() => setMetric(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Group by gender</span>
          </label>
        </div>
        {isPending && (
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">Updating…</p>
        )}
        {historicalError && (
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load historical leaderboard.</p>
        )}
        {!historicalError && historicalUrl && rows.length === 0 && !historicalData && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}
        {!historicalError && historicalUrl && historicalData && rows.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No entries in this range.</p>
        )}
        {!historicalError && rows.length > 0 && (
          <div className="space-y-4">
            {showGrouped ? (
              <>
                {male.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Boys</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {male.map((r) => (
                        <div
                          key={r.athlete_id}
                          className={`relative flex flex-col rounded-lg border p-3 ${rankClass(r.rank)}`}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
                        >
                          <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            #{r.rank}
                          </span>
                          <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
                            {r.first_name} {r.last_name}
                          </span>
                          <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
                            {formatValue(r.display_value)}{" "}
                            <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
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
                    <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Girls</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {female.map((r) => (
                        <div
                          key={r.athlete_id}
                          className={`relative flex flex-col rounded-lg border p-3 ${rankClass(r.rank)}`}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
                        >
                          <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            #{r.rank}
                          </span>
                          <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
                            {r.first_name} {r.last_name}
                          </span>
                          <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
                            {formatValue(r.display_value)}{" "}
                            <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
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
                    <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                      #{r.rank}
                    </span>
                    <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
                      {r.first_name} {r.last_name}
                    </span>
                    <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
                      {formatValue(r.display_value)}{" "}
                      <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
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

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Progression
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Best value per session for one athlete and metric (uses the same date range above).
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Athlete</span>
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Metric</span>
            <select
              value={progressionMetric}
              onChange={(e) => setProgressionMetric(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select an athlete and metric to see progression.
          </p>
        )}
      </section>
    </div>
  );
}
