"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import Link from "next/link";
import { PageBackground } from "@/app/components/PageBackground";
import type { LeaderboardRow } from "@/types";
import type { SessionMetric, SessionMetricComponent } from "@/app/api/leaderboard/session-metrics/route";

type SessionItem = { id: string; session_date: string; phase?: string; phase_week?: number };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function rankClass(rank: number): string {
  if (rank === 1) return "bg-gold/20 text-gold border border-gold/50";
  if (rank === 2) return "bg-silver/20 text-silver border border-silver/50";
  if (rank === 3) return "bg-bronze/20 text-bronze border border-bronze/50";
  return "bg-surface border border-border text-foreground";
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
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}>
          <header className="mb-6 flex items-center justify-between">
            <div>
              <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Live leaderboard
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Home
            </Link>
          </header>

          <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground-muted">Session</span>
          <select
            value={sessionId}
            onChange={(e) => startTransition(() => setSessionId(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent"
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
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm text-foreground-muted">Group by gender</span>
        </label>
      </section>

      {!sessionId ? (
        <p className="text-sm text-foreground-muted">
          Select a session to view metrics and leaderboards.
        </p>
      ) : sessionMetricsUrl && !sessionMetricsData ? (
        <p className="text-sm text-foreground-muted">Loading session metrics…</p>
      ) : metrics.length === 0 ? (
        <p className="text-sm text-foreground-muted">No metrics with entries for this session.</p>
      ) : (
        <div className="space-y-4">
          {(isPending && metrics.length > 0) && (
            <p className="mb-2 text-xs text-foreground-muted">Updating…</p>
          )}
          <ul className="space-y-2">
            {metrics.map((metric) => {
              const selectedSet = selectedComponentsByMetric[metric.metric_key] ?? new Set<string>();
              const selectedComponents = metric.components.filter((c) => selectedSet.has(componentKey(c)));
              return (
                <li key={metric.metric_key} className="rounded-lg border border-border bg-surface overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMetric(metric.metric_key, metric)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-foreground hover:bg-surface-elevated transition-colors"
                  >
                    <span>
                      {metric.display_name}
                      <span className="ml-2 text-sm font-normal text-foreground-muted">
                        ({metric.units})
                      </span>
                    </span>
                    <span className="text-foreground-muted">
                      {expandedMetrics.has(metric.metric_key) ? "▼" : "▶"}
                    </span>
                  </button>
                  {expandedMetrics.has(metric.metric_key) && (
                    <div className="border-t border-border bg-surface-elevated px-4 py-3">
                      <p className="mb-2 text-sm font-medium text-foreground-muted">
                        Show leaderboard
                      </p>
                      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
                        {metric.components.map((comp) => {
                          const key = componentKey(comp);
                          const checked = selectedSet.has(key);
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleComponent(metric.metric_key, key, e.target.checked)}
                                  className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
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
                        <p className="text-sm text-foreground-muted">
                          Select one or more leaderboards above.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
        </div>
      </div>
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
  const { data, error, isLoading, mutate } = useSWR<{
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
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        {component.label}
      </h3>
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-danger">Failed to load leaderboard.</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface"
          >
            Retry
          </button>
        </div>
      )}
      {isLoading && rows.length === 0 && (
        <p className="text-sm text-foreground-muted">Loading…</p>
      )}
      {!error && !isLoading && rows.length === 0 && (
        <p className="text-sm text-foreground-muted">No entries.</p>
      )}
      {!error && (rows.length > 0 || (isLoading && rows.length > 0)) && (
        <>
          {showGrouped ? (
            <div className="space-y-4">
              {male.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-foreground-muted">Boys</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {male.map((r) => (
                      <LeaderboardCard key={r.athlete_id} row={r} units={units} />
                    ))}
                  </div>
                </div>
              )}
              {female.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-foreground-muted">Girls</p>
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
      <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-foreground-muted">
        #{row.rank}
      </span>
      <span className="min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight">
        {row.first_name} {row.last_name}
      </span>
      <span className="mt-2 font-mono text-lg font-semibold tabular-nums">
        {formatValue(row.display_value)} <span className="text-sm font-normal text-foreground-muted">{units}</span>
      </span>
    </div>
  );
}

function formatValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
