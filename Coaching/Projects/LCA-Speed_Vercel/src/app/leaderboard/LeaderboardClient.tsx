"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { LeaderboardRow } from "@/types";
import type { SessionMetric, SessionMetricComponent } from "@/app/api/leaderboard/session-metrics/route";

type SessionItem = { id: string; session_date: string; phase?: string; phase_week?: number };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function rankClass(rank: number): string {
  if (rank === 1) return "bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-400/50";
  if (rank === 2) return "bg-zinc-300/30 text-zinc-600 dark:text-zinc-400 border-zinc-400/50";
  if (rank === 3) return "bg-amber-700/20 text-amber-800 dark:text-amber-600 border-amber-600/50";
  return "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700";
}

function componentKey(comp: SessionMetricComponent): string {
  return `${comp.interval_index ?? "n"}_${comp.component ?? "n"}`;
}

function buildLeaderboardUrl(
  sessionId: string,
  metricKey: string,
  component: SessionMetricComponent,
  groupByGender: boolean
): string {
  const params = new URLSearchParams({
    session_id: sessionId,
    metric: metricKey,
  });
  if (component.interval_index != null) {
    params.set("interval_index", String(component.interval_index));
  }
  if (component.component != null && component.component !== "") {
    params.set("component", component.component);
  }
  if (groupByGender) params.set("group_by", "gender");
  return `/api/leaderboard?${params.toString()}`;
}

export function LeaderboardClient() {
  const [sessionId, setSessionId] = useState("");
  const [groupByGender, setGroupByGender] = useState(false);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());
  /** Per-metric set of selected component keys; default to first (Overall) when expanding */
  const [selectedComponentsByMetric, setSelectedComponentsByMetric] = useState<Record<string, Set<string>>>({});
  const [isPending, startTransition] = useTransition();

  const { data: sessionsData } = useSWR<{ data: SessionItem[] }>("/api/sessions", fetcher);
  const sessions = sessionsData?.data ?? [];

  const sessionMetricsUrl =
    sessionId ? `/api/leaderboard/session-metrics?session_id=${encodeURIComponent(sessionId)}` : null;
  const { data: sessionMetricsData } = useSWR<{ data: { metrics: SessionMetric[] } }>(
    sessionMetricsUrl,
    fetcher
  );
  const metrics = sessionMetricsData?.data?.metrics ?? [];

  const toggleMetric = (metricKey: string, metric?: SessionMetric) => {
    startTransition(() => {
      setExpandedMetrics((prev) => {
        const next = new Set(prev);
        if (next.has(metricKey)) {
          next.delete(metricKey);
        } else {
          next.add(metricKey);
          if (metric && metric.components.length > 0 && !selectedComponentsByMetric[metricKey]?.size) {
            setSelectedComponentsByMetric((s) => ({
              ...s,
              [metricKey]: new Set([componentKey(metric.components[0])]),
            }));
          }
        }
        return next;
      });
    });
  };

  const toggleComponent = (metricKey: string, compKey: string, checked: boolean) => {
    startTransition(() => {
      setSelectedComponentsByMetric((s) => {
        const prev = s[metricKey] ?? new Set<string>();
        const next = new Set(prev);
        if (checked) next.add(compKey);
        else next.delete(compKey);
        return { ...s, [metricKey]: next };
      });
    });
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live leaderboard</h1>
        <Link
          href="/"
          className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Home
        </Link>
      </header>

      <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Session</span>
          <select
            value={sessionId}
            onChange={(e) => startTransition(() => setSessionId(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Select session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.session_date}
                {s.phase != null ? ` — ${s.phase}` : ""}
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
      </section>

      {!sessionId ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Select a session to view metrics and leaderboards.
        </p>
      ) : sessionMetricsUrl && !sessionMetricsData ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading session metrics…</p>
      ) : metrics.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No metrics with entries for this session.</p>
      ) : (
        <>
          {(isPending && metrics.length > 0) && (
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">Updating…</p>
          )}
          <ul className="space-y-2">
            {metrics.map((metric) => {
              const selectedSet = selectedComponentsByMetric[metric.metric_key] ?? new Set<string>();
              const selectedComponents = metric.components.filter((c) => selectedSet.has(componentKey(c)));
              return (
                <li key={metric.metric_key} className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => toggleMetric(metric.metric_key, metric)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <span>
                      {metric.display_name}
                      <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                        ({metric.units})
                      </span>
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {expandedMetrics.has(metric.metric_key) ? "▼" : "▶"}
                    </span>
                  </button>
                  {expandedMetrics.has(metric.metric_key) && (
                    <div className="border-t border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/30">
                      <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        Show leaderboard
                      </p>
                      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
                        {metric.components.map((comp) => {
                          const key = componentKey(comp);
                          const checked = selectedSet.has(key);
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleComponent(metric.metric_key, key, e.target.checked)}
                                  className="h-4 w-4 rounded border-zinc-300"
                                />
                                {comp.label}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {selectedComponents.length > 0 ? (
                        <div className="space-y-6">
                          {selectedComponents.map((comp) => (
                            <ComponentLeaderboard
                              key={componentKey(comp)}
                              sessionId={sessionId}
                              metric={metric}
                              component={comp}
                              groupByGender={groupByGender}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          Select one or more leaderboards above.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function ComponentLeaderboard({
  sessionId,
  metric,
  component,
  groupByGender,
}: {
  sessionId: string;
  metric: SessionMetric;
  component: SessionMetricComponent;
  groupByGender: boolean;
}) {
  const url = buildLeaderboardUrl(sessionId, metric.metric_key, component, groupByGender);
  const { data, error, isLoading } = useSWR<{
    data: {
      rows: LeaderboardRow[];
      male?: LeaderboardRow[];
      female?: LeaderboardRow[];
      metric_display_name: string;
      units: string;
    };
  }>(url, fetcher);

  const rows = data?.data?.rows ?? [];
  const male = data?.data?.male ?? [];
  const female = data?.data?.female ?? [];
  const units = data?.data?.units ?? metric.units;
  const showGrouped = groupByGender && (male.length > 0 || female.length > 0);

  return (
    <div className="mt-2">
      <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {component.label}
      </h3>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load leaderboard.</p>
      )}
      {isLoading && rows.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      )}
      {!error && !isLoading && rows.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No entries.</p>
      )}
      {!error && (rows.length > 0 || (isLoading && rows.length > 0)) && (
        <>
          {showGrouped ? (
            <div className="space-y-4">
              {male.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Boys</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {male.map((r) => (
                      <LeaderboardCard key={r.athlete_id} row={r} units={units} />
                    ))}
                  </div>
                </div>
              )}
              {female.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Girls</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {female.map((r) => (
                      <LeaderboardCard key={r.athlete_id} row={r} units={units} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rows.map((r) => (
                <LeaderboardCard key={r.athlete_id} row={r} units={units} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LeaderboardCard({ row, units }: { row: LeaderboardRow; units: string }) {
  return (
    <div
      className={`relative flex flex-col rounded-lg border p-3 ${rankClass(row.rank)}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
    >
      <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
        #{row.rank}
      </span>
      <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
        {row.first_name} {row.last_name}
      </span>
      <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
        {formatValue(row.display_value)} <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">{units}</span>
      </span>
    </div>
  );
}

function formatValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
