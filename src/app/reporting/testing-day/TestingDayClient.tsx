"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import type { SessionMetric } from "@/app/api/leaderboard/session-metrics/route";
import type { NormPopulationOption } from "@/types";
import {
  resolveTestingDayComponent,
  testingDayNamedComponents,
  type TestingDayGroup,
  type TestingDaySummaryData,
} from "@/lib/norms/testing-day";
import { ZONE_COLORS, type ZoneLabel } from "@/lib/norms/palette";
import {
  HUGO_GROUP_META,
  isHugoGroup,
} from "@/lib/weight-room/constants";
import "./testing-day-print.css";

type SessionItem = {
  id: string;
  session_date: string;
  phase?: string;
  phase_week?: number;
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/reporting/testing-day";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: unknown };
      if (typeof json.error === "string" && json.error.trim()) {
        message = json.error;
      }
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function fmtMark(value: number, units: string): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return units ? `${n} ${units}` : n;
}

function sportLabel(sport: string | null): string {
  if (sport == null) return "No primary sport";
  if (isHugoGroup(sport)) return HUGO_GROUP_META[sport].label;
  return sport;
}

function genderLabel(gender: "M" | "F" | null): string {
  if (gender === "M") return "M";
  if (gender === "F") return "F";
  return "Unknown";
}

export default function TestingDayClient() {
  const [sessionId, setSessionId] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [component, setComponent] = useState("");
  const [populationId, setPopulationId] = useState("");
  const [, startTransition] = useTransition();

  const { data: sessionsData } = useSWR<{ data: SessionItem[] }>(
    "/api/sessions",
    jsonFetcher
  );
  const sessions = sessionsData?.data ?? [];

  const { data: populationsData } = useSWR<{ data: NormPopulationOption[] }>(
    "/api/norms/populations",
    jsonFetcher
  );
  const populations = populationsData?.data ?? [];

  const sessionMetricsUrl = sessionId
    ? `/api/leaderboard/session-metrics?session_id=${encodeURIComponent(sessionId)}`
    : null;
  const { data: sessionMetricsData } = useSWR<{ data: { metrics: SessionMetric[] } }>(
    sessionMetricsUrl,
    jsonFetcher
  );
  const metrics = sessionMetricsData?.data?.metrics ?? [];

  const uniqueMetrics = useMemo(() => {
    const seen = new Set<string>();
    const out: { metric_key: string; display_name: string }[] = [];
    for (const m of metrics) {
      if (seen.has(m.metric_key)) continue;
      seen.add(m.metric_key);
      out.push({ metric_key: m.metric_key, display_name: m.display_name });
    }
    return out;
  }, [metrics]);

  const sessionComponents = useMemo(() => {
    if (!metricKey) return [];
    return metrics
      .filter((m) => m.metric_key === metricKey)
      .flatMap((m) => m.components);
  }, [metrics, metricKey]);

  const namedComponents = useMemo(
    () => testingDayNamedComponents(metricKey, sessionComponents),
    [metricKey, sessionComponents]
  );

  const summaryUrl = useMemo(() => {
    if (!sessionId || !metricKey) return null;
    const params = new URLSearchParams({
      session_id: sessionId,
      metric: metricKey,
    });
    if (component) params.set("component", component);
    if (populationId) params.set("population_id", populationId);
    return `/api/reporting/testing-day?${params.toString()}`;
  }, [sessionId, metricKey, component, populationId]);

  const { data, error, isLoading } = useSWR<{ data: TestingDaySummaryData }>(
    summaryUrl,
    jsonFetcher
  );
  const summary = data?.data;

  function onSessionChange(id: string) {
    startTransition(() => {
      setSessionId(id);
      setMetricKey("");
      setComponent("");
    });
  }

  function onMetricChange(key: string) {
    startTransition(() => {
      setMetricKey(key);
      const sessionComps = metrics
        .filter((m) => m.metric_key === key)
        .flatMap((m) => m.components);
      const named = testingDayNamedComponents(key, sessionComps);
      const resolved = resolveTestingDayComponent(key, null);
      const next =
        resolved && named.includes(resolved)
          ? resolved
          : named[0] ?? resolved ?? "";
      setComponent(next);
    });
  }

  const selectedSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 print:overflow-visible print:bg-white print:px-0 print:py-0 md:px-8 md:py-10">
      <div className="testing-day-chrome print:hidden">
        <PageBackground />
      </div>
      <div className="relative z-10 mx-auto max-w-4xl space-y-8 print:max-w-none print:space-y-4">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none print:ring-0 md:p-8">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:mb-4">
            <div>
              <div className="testing-day-chrome mb-4 inline-block h-1 w-16 rounded-full bg-accent print:hidden" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl print:text-2xl">
                Testing-day summary
              </h1>
              <p className="testing-day-chrome mt-2 text-sm text-foreground-muted print:hidden">
                Groups by primary sport and gender. Zones follow the live stick —
                override paints everyone with one table.
              </p>
              {summary && (
                <p className="mt-2 hidden text-sm text-foreground print:block">
                  {summary.session_date}
                  {summary.phase ? ` — ${summary.phase}` : ""} ·{" "}
                  {summary.metric_display_name}
                  {summary.component ? ` (${summary.component})` : ""}
                </p>
              )}
            </div>
            <div className="testing-day-chrome flex shrink-0 flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!summary}
                className="rounded-xl border border-accent/60 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print
              </button>
              <Link
                href="/reporting"
                className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
              >
                Reporting
              </Link>
            </div>
          </header>

          <div className="testing-day-chrome mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
            <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Session</span>
              <select
                value={sessionId}
                onChange={(e) => onSessionChange(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Select session</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.session_date).slice(0, 10)}
                    {s.phase != null ? ` — ${s.phase}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Metric</span>
              <select
                value={metricKey}
                onChange={(e) => onMetricChange(e.target.value)}
                disabled={!sessionId}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground disabled:opacity-60"
              >
                <option value="">Select metric</option>
                {uniqueMetrics.map((m) => (
                  <option key={m.metric_key} value={m.metric_key}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </label>
            {namedComponents.length > 0 && (
              <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
                <span className="text-foreground-muted">Component</span>
                <select
                  value={component}
                  onChange={(e) =>
                    startTransition(() => setComponent(e.target.value))
                  }
                  className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                >
                  {namedComponents.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex min-w-[14rem] flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Compare using</span>
              <select
                value={populationId}
                onChange={(e) =>
                  startTransition(() => setPopulationId(e.target.value))
                }
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Athlete sport default</option>
                {populations.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <p className="testing-day-chrome mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 print:hidden">
              {error instanceof Error ? error.message : "Failed to load summary"}
            </p>
          )}

          {isLoading && summaryUrl && (
            <p className="testing-day-chrome text-sm text-foreground-muted print:hidden" aria-live="polite">
              Loading summary…
            </p>
          )}

          {!sessionId || !metricKey ? (
            <p className="testing-day-chrome text-sm text-foreground-muted print:hidden">
              Pick a session and metric
              {selectedSession ? ` (${String(selectedSession.session_date).slice(0, 10)})` : ""}.
            </p>
          ) : null}

          {summary && !isLoading && (
            <div className="space-y-6 print:space-y-4">
              {summary.groups.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No entries for this session, metric, and component.
                </p>
              ) : (
                summary.groups.map((group) => (
                  <TestingDaySection
                    key={`${group.sport ?? "none"}-${group.gender ?? "u"}`}
                    group={group}
                    units={summary.units}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestingDaySection({
  group,
  units,
}: {
  group: TestingDayGroup;
  units: string;
}) {
  return (
    <section className="testing-day-section rounded-xl border border-border bg-surface-elevated/40 p-4 print:border-neutral-300 print:bg-transparent">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          {sportLabel(group.sport)} · {genderLabel(group.gender)}
        </h2>
        <p className="text-sm tabular-nums text-foreground-muted">
          n = {group.headcount}
        </p>
      </header>

      {!group.has_standard ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground-muted">No standard</p>
          <UnbadgedList athletes={group.unbadged} units={units} emptyLabel="No athletes" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {group.label_counts.map((c) => (
              <span
                key={c.label}
                className="zone-badge tabular-nums"
                style={{ color: ZONE_COLORS[c.label as ZoneLabel] }}
              >
                {c.label} {c.count}
              </span>
            ))}
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-sm font-semibold tabular-nums text-foreground">
              Efficient+ {group.efficient_plus}
            </span>
          </div>
          {group.unbadged.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground-muted">
                Unbadged
              </h3>
              <UnbadgedList athletes={group.unbadged} units={units} emptyLabel="" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function UnbadgedList({
  athletes,
  units,
  emptyLabel,
}: {
  athletes: TestingDayGroup["unbadged"];
  units: string;
  emptyLabel: string;
}) {
  if (athletes.length === 0) {
    return emptyLabel ? (
      <p className="text-sm text-foreground-muted">{emptyLabel}</p>
    ) : null;
  }
  return (
    <ul className="space-y-1 text-sm text-foreground">
      {athletes.map((a) => (
        <li key={a.athlete_id} className="flex justify-between gap-4">
          <span>
            {a.first_name} {a.last_name}
          </span>
          <span className="tabular-nums text-foreground-muted">
            {fmtMark(a.display_value, units)}
          </span>
        </li>
      ))}
    </ul>
  );
}
